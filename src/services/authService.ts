import { getString, PREF_KEYS, removeString, setString } from '../storage/preferences';
import {
  clearSecureStore,
  getSecureItem,
  getSecureJson,
  SECURE_KEYS,
  setSecureItem,
  setSecureJson,
} from '../storage/secureStorage';
import { useUzzapStore } from '../store';
import type { AuthTokens, StoredUser } from '../store/slices/authSlice';
import type { AuthPhase, AuthSession } from '../types/models';
import type { AuthCredentials, Stanza } from '../types/protocol';
import { buildIq, newIqId, wsClient } from './wsClient';
import type { VCardData } from './wsClient';
import { smsValidationService } from './smsValidationService';

/**
 * Account lifecycle against the legacy registry/validation targets.
 *
 * Flow (spec §7, §12.5):
 *   register  → `pre-register` IQ → `register` IQ → SMS PIN → `confirmation`
 *   login     → TCP connect → SASL PLAIN → bind → `query-roster`
 *   logout    → disconnect + wipe SecureStore
 *
 * Credentials are persisted through SecureStore only; the plaintext password is
 * never written to SQLite or AsyncStorage.
 */

export interface RegisterInput {
  username: string;
  password: string;
  displayName?: string;
  phoneNumber?: string;
  email?: string;
  groups?: string[];
  firstName?: string;
  lastName?: string;
  deviceModel?: string;
}

export interface AuthResult {
  ok: boolean;
  phase: AuthPhase;
  session?: AuthSession;
  mobile?: string;
  error?: string;
}

/** Last-used account id, pre-filled on the login screen (never the password). */
export interface RememberedCredentials {
  userId: string;
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unexpected error';
}

function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length <= 4) return mobile;
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  return `${head}${'*'.repeat(Math.max(0, digits.length - 4))}${tail}`;
}

function extractIqError(stanza: Stanza): string | undefined {
  const keys = stanza.keys;
  const direct = keys['iq/error.amaz-error'];
  if (direct) return direct;
  for (const [key, value] of Object.entries(keys)) {
    if (key.startsWith('iq/error') && value) return value;
  }
  if (keys['iq.type'] === 'error') return 'unknown-error';
  return undefined;
}

export class AuthService {
  /* ---------------------------------------------------------------------- */
  /* Persistence                                                            */
  /* ---------------------------------------------------------------------- */

  async getStoredCredentials(): Promise<AuthCredentials | null> {
    const [username, password] = await Promise.all([
      getSecureItem(SECURE_KEYS.username),
      getSecureItem(SECURE_KEYS.password),
    ]);
    if (!username || password === null) return null;
    return { username, password };
  }

  async getStoredSession(): Promise<AuthSession | null> {
    return getSecureJson<AuthSession>(SECURE_KEYS.authSession);
  }

  getSession(): AuthSession | null {
    const state = useUzzapStore.getState();
    if (!state.user) return null;
    return {
      userId: state.user.id,
      username: state.user.id,
      displayName:
        [state.user.firstName, state.user.lastName].filter(Boolean).join(' ') || state.user.id,
      token: state.tokens?.accessToken,
      phase: state.phase,
      issuedAt: state.user.lastLogin ?? state.user.createdAt,
    };
  }

  private async persistCredentials(credentials: AuthCredentials): Promise<void> {
    await Promise.all([
      setSecureItem(SECURE_KEYS.username, credentials.username),
      setSecureItem(SECURE_KEYS.password, credentials.password),
    ]);
  }

  private async persistSession(session: AuthSession, tokens: AuthTokens): Promise<void> {
    await Promise.all([
      setSecureJson(SECURE_KEYS.authSession, session),
      setSecureItem(SECURE_KEYS.authToken, tokens.accessToken),
    ]);
  }

  /* ---------------------------------------------------------------------- */
  /* Login                                                                  */
  /* ---------------------------------------------------------------------- */

  async login(userId: string, password: string): Promise<AuthResult> {
    const initial = useUzzapStore.getState();
    initial.setLoggingIn(true);
    initial.setLoginError(null);
    initial.setPhase('unknown');

    let mobile: string | undefined;
    const unsubscribe = wsClient.addListener((event) => {
      if (event.type === 'auth-success' && event.mobile) mobile = event.mobile;
    });

    try {
      await wsClient.connect({
        authenticate: true,
        credentials: { username: userId, password },
      });
    } catch (error) {
      const message = toMessage(error);
      const state = useUzzapStore.getState();
      state.setLoggingIn(false);
      state.setLoginError(message);
      state.setPhase('unauthenticated');
      return { ok: false, error: message, phase: 'unauthenticated' };
    } finally {
      unsubscribe();
    }

    const issuedAt = Date.now();
    const storedUser: StoredUser = {
      id: userId,
      phoneNumber: null,
      firstName: null,
      lastName: null,
      email: null,
      createdAt: issuedAt,
      lastLogin: issuedAt,
    };
    const session: AuthSession = {
      userId,
      username: userId,
      displayName: userId,
      phase: 'authenticated',
      mobileMasked: mobile ? maskMobile(mobile) : undefined,
      issuedAt,
    };
    const tokens: AuthTokens = {
      accessToken: `${userId}:${issuedAt}`,
      expiresAt: Math.floor(issuedAt / 1000) + 86_400,
    };

    await this.persistCredentials({ username: userId, password });
    await this.persistSession(session, tokens);

    const state = useUzzapStore.getState();
    state.setUser(storedUser);
    state.setTokens(tokens);
    state.setPhase('authenticated');
    state.setLoggingIn(false);

    // Roster is requested by the engine on `online`; wait briefly for it so the
    // contact list is warm before login resolves (best-effort).
    await this.waitForRoster(8_000).catch(() => null);

    return { ok: true, session, phase: 'authenticated', mobile };
  }

  /* ---------------------------------------------------------------------- */
  /* Registration / PIN                                                     */
  /* ---------------------------------------------------------------------- */

  async register(input: RegisterInput): Promise<AuthResult> {
    try {
      if (!wsClient.isConnected()) {
        await wsClient.connect({
          authenticate: false,
          credentials: { username: input.username, password: input.password },
        });
      }
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'unauthenticated' };
    }

    const vcard: VCardData = {
      username: input.username,
      displayname: input.displayName ?? input.username,
      phone: input.phoneNumber,
      email: input.email,
      groups: input.groups,
    };

    const preId = newIqId('REG');
    const preXml = buildIq({
      id: preId,
      type: 'set',
      action: 'pre-register',
      target: 'registry',
      amazProtocol: 'registry',
      method: 'pin',
      vcard,
    });

    try {
      const preResponse = await wsClient.sendIqAndWait(
        preXml,
        (stanza) => stanza.tag === 'iq' && stanza.keys['iq.id'] === preId,
        20_000,
      );
      const preError = extractIqError(preResponse);
      if (preError) return { ok: false, error: preError, phase: 'unauthenticated' };
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'unauthenticated' };
    }

    const regId = newIqId('REG');
    const regVcard: VCardData = {
      ...vcard,
      extra: { model: input.deviceModel ?? 'react-native' },
    };
    const regXml = buildIq({
      id: regId,
      type: 'set',
      action: 'register',
      target: 'registry',
      amazProtocol: 'registry',
      method: 'pin',
      vcard: regVcard,
    });

    try {
      const regResponse = await wsClient.sendIqAndWait(
        regXml,
        (stanza) => stanza.tag === 'iq' && stanza.keys['iq.id'] === regId,
        20_000,
      );
      const regError = extractIqError(regResponse);
      if (regError) return { ok: false, error: regError, phase: 'unauthenticated' };
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'unauthenticated' };
    }

    // Persist credentials for the follow-up PIN validation / login.
    await this.persistCredentials({ username: input.username, password: input.password });
    useUzzapStore.getState().setPhase('needs-pin');

    // Set pending registration so SMS listener knows which user to validate
    await smsValidationService.setPendingRegistration(input.username);

    return { ok: true, phase: 'needs-pin' };
  }

  async validatePin(pin: string): Promise<AuthResult> {
    if (!wsClient.isConnected()) {
      const credentials = await this.getStoredCredentials();
      if (!credentials) {
        return { ok: false, error: 'missing-credentials', phase: 'needs-pin' };
      }
      try {
        await wsClient.connect({ authenticate: true, credentials });
      } catch (error) {
        return { ok: false, error: toMessage(error), phase: 'needs-pin' };
      }
    }

    const credentials = await this.getStoredCredentials();
    const id = newIqId('VALIDATE');
    const xml = buildIq({
      id,
      type: 'set',
      action: 'confirmation',
      target: 'validation',
      amazProtocol: 'validation',
      method: 'pin',
      vcard: { username: credentials?.username, pin },
    });

    try {
      const response = await wsClient.sendIqAndWait(
        xml,
        (stanza) => stanza.tag === 'iq' && stanza.keys['iq.id'] === id,
        20_000,
      );
      const error = extractIqError(response);
      if (error) return { ok: false, error, phase: 'needs-pin' };
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'needs-pin' };
    }

    useUzzapStore.getState().setPhase('authenticated');
    return { ok: true, phase: 'authenticated' };
  }

  /** UI-facing alias for {@link validatePin}. */
  async verifyPin(pin: string): Promise<AuthResult> {
    return this.validatePin(pin);
  }

  /**
   * Request a fresh SMS validation PIN (`pin-request` on the `validation`
   * target — spec §12.5). Used by the "resend code" affordance on the PIN
   * screen.
   */
  async resendPin(userId: string): Promise<AuthResult> {
    try {
      if (!wsClient.isConnected()) {
        const credentials = await this.getStoredCredentials();
        await wsClient.connect({
          authenticate: false,
          credentials: credentials ?? { username: userId, password: '' },
        });
      }
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'needs-pin' };
    }

    const id = newIqId('PINREQ');
    const xml = buildIq({
      id,
      type: 'set',
      action: 'pin-request',
      target: 'validation',
      amazProtocol: 'validation',
      method: 'pin',
      vcard: { username: userId },
    });

    try {
      const response = await wsClient.sendIqAndWait(
        xml,
        (stanza) => stanza.tag === 'iq' && stanza.keys['iq.id'] === id,
        20_000,
      );
      const error = extractIqError(response);
      if (error) return { ok: false, error, phase: 'needs-pin' };
      return { ok: true, phase: 'needs-pin' };
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'needs-pin' };
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Session lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  async refreshToken(): Promise<AuthResult> {
    const credentials = await this.getStoredCredentials();
    if (!credentials) {
      return { ok: false, error: 'missing-credentials', phase: 'unauthenticated' };
    }
    wsClient.disconnect('refresh');
    return this.login(credentials.username, credentials.password);
  }

  async logout(): Promise<void> {
    wsClient.disconnect('logout');
    await clearSecureStore();
    useUzzapStore.getState().signOut();
    // Clear any pending SMS registration
    await smsValidationService.clearPendingRegistration();
  }

  /** Restore a stored session at cold start without a network round-trip. */
  async restoreSession(): Promise<AuthSession | null> {
    const session = await this.getStoredSession();
    const credentials = await this.getStoredCredentials();
    if (!session || !credentials) return null;
    const state = useUzzapStore.getState();
    state.setPhase(session.phase);
    return session;
  }

  private waitForRoster(timeoutMs: number): Promise<Stanza | null> {
    return new Promise((resolve) => {
      const unsubscribe = wsClient.addListener((event) => {
        if (event.type === 'roster') {
          unsubscribe();
          resolve(event.stanza);
        }
      });
      setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, timeoutMs);
    });
  }
}

export const authService = new AuthService();

/* Convenience function bindings (spec-named API). */
export const register = (input: RegisterInput): Promise<AuthResult> => authService.register(input);
export const login = (userId: string, password: string): Promise<AuthResult> =>
  authService.login(userId, password);
export const validatePin = (pin: string): Promise<AuthResult> => authService.validatePin(pin);
export const verifyPin = (pin: string): Promise<AuthResult> => authService.verifyPin(pin);
export const resendPin = (userId: string): Promise<AuthResult> => authService.resendPin(userId);
export const logout = (): Promise<void> => authService.logout();
export const refreshToken = (): Promise<AuthResult> => authService.refreshToken();
export const restoreSession = (): Promise<AuthSession | null> => authService.restoreSession();
export const getStoredCredentials = (): Promise<AuthCredentials | null> =>
  authService.getStoredCredentials();

/* -------------------------------------------------------------------------- */
/* Remembered account (login pre-fill)                                        */
/* -------------------------------------------------------------------------- */

/** Persist only the last-used user id; the password never leaves SecureStore. */
export async function rememberCredentials(userId: string): Promise<void> {
  await setString(PREF_KEYS.lastUserId, userId);
}

export async function getRememberedCredentials(): Promise<RememberedCredentials | null> {
  const userId = await getString(PREF_KEYS.lastUserId);
  return userId ? { userId } : null;
}

export async function forgetCredentials(): Promise<void> {
  await removeString(PREF_KEYS.lastUserId);
}
