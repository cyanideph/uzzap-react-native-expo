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
import type { AuthCredentials } from '../types/protocol';
import { supabase } from './supabaseClient';

/**
 * Account lifecycle on Supabase (Auth + `profiles` table).
 *
 * Flow (mirrors the legacy PIN flow 1:1 so the UI is unchanged):
 *   register  → `signUp(email, password)` → email OTP code → `verifyOtp`
 *   login     → resolve username → email → `signInWithPassword`
 *   logout    → `signOut` + wipe SecureStore
 *
 * The legacy `needs-pin` phase now means "email verification code pending":
 * Supabase sends a 6-digit OTP that the existing PIN screen collects.
 * If the project has email confirmation disabled, sign-up returns a session
 * immediately and PIN validation short-circuits to `authenticated`.
 *
 * Credentials are persisted through SecureStore only; the plaintext password is
 * never written to SQLite or AsyncStorage.
 */

const EMAIL_KEY = 'uzzap.auth.email';

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

  async getStoredEmail(): Promise<string | null> {
    return getSecureItem(EMAIL_KEY);
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

  private async persistCredentials(credentials: AuthCredentials, email?: string): Promise<void> {
    await Promise.all([
      setSecureItem(SECURE_KEYS.username, credentials.username),
      setSecureItem(SECURE_KEYS.password, credentials.password),
      ...(email ? [setSecureItem(EMAIL_KEY, email)] : []),
    ]);
  }

  private async persistSession(session: AuthSession, tokens: AuthTokens): Promise<void> {
    await Promise.all([
      setSecureJson(SECURE_KEYS.authSession, session),
      setSecureItem(SECURE_KEYS.authToken, tokens.accessToken),
    ]);
  }

  /** Resolve a legacy username to its Supabase Auth email. */
  private async emailForUsername(username: string): Promise<string | null> {
    if (username.includes('@')) return username;
    const [storedEmail, storedUser] = await Promise.all([
      this.getStoredEmail(),
      getSecureItem(SECURE_KEYS.username),
    ]);
    if (storedEmail && storedUser === username) return storedEmail;
    return null;
  }

  private async applySession(
    userId: string,
    accessToken: string,
    expiresAt: number,
    issuedAt: number,
    authUid: string,
  ): Promise<{ session: AuthSession; tokens: AuthTokens; user: StoredUser }> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, phone_number, first_name, last_name, created_at')
      .eq('id', authUid)
      .maybeSingle();

    const displayName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
      profile?.display_name ||
      profile?.username ||
      userId;

    const storedUser: StoredUser = {
      id: (profile?.username as string | undefined) ?? userId,
      phoneNumber: (profile?.phone_number as string | null | undefined) ?? null,
      firstName: (profile?.first_name as string | null | undefined) ?? null,
      lastName: (profile?.last_name as string | null | undefined) ?? null,
      email: null,
      createdAt: Number(profile?.created_at ?? 0) || issuedAt,
      lastLogin: issuedAt,
    };
    const session: AuthSession = {
      userId: storedUser.id,
      username: storedUser.id,
      displayName,
      phase: 'authenticated',
      mobileMasked: profile?.phone_number ? maskMobile(profile.phone_number) : undefined,
      mobile: profile?.phone_number ?? undefined,
      issuedAt,
    };
    const tokens: AuthTokens = { accessToken, expiresAt };

    await this.persistSession(session, tokens);

    const state = useUzzapStore.getState();
    state.setUser(storedUser);
    state.setTokens(tokens);
    state.setPhase('authenticated');
    state.setLoggingIn(false);
    return { session, tokens, user: storedUser };
  }

  /* ---------------------------------------------------------------------- */
  /* Login                                                                  */
  /* ---------------------------------------------------------------------- */

  async login(userId: string, password: string): Promise<AuthResult> {
    const initial = useUzzapStore.getState();
    initial.setLoggingIn(true);
    initial.setLoginError(null);
    initial.setPhase('unknown');

    try {
      const email = await this.emailForUsername(userId.trim());
      if (!email) {
        throw new Error('Unknown user on this device — sign in with your email address.');
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) {
        throw new Error('Email not confirmed — check your inbox for the verification code.');
      }
      await this.persistCredentials({ username: userId.trim(), password }, email);
      const issuedAt = Date.now();
      const { session } = await this.applySession(
        userId.trim(),
        data.session.access_token,
        data.session.expires_at ?? Math.floor(issuedAt / 1000) + 3600,
        issuedAt,
        data.session.user.id,
      );
      return { ok: true, session, phase: 'authenticated', mobile: session.mobile };
    } catch (error) {
      const message = toMessage(error);
      const state = useUzzapStore.getState();
      state.setLoggingIn(false);
      state.setLoginError(message);
      state.setPhase('unauthenticated');
      return { ok: false, error: message, phase: 'unauthenticated' };
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Registration / PIN (email OTP)                                         */
  /* ---------------------------------------------------------------------- */

  async register(input: RegisterInput): Promise<AuthResult> {
    if (!input.email) {
      return { ok: false, error: 'Email is required for registration.', phase: 'unauthenticated' };
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            username: input.username,
            display_name: input.displayName ?? input.username,
            phone_number: input.phoneNumber ?? null,
            first_name: input.firstName ?? null,
            last_name: input.lastName ?? null,
          },
        },
      });
      if (error) throw error;
      if (data.user && (data.user.identities?.length ?? 1) === 0) {
        return { ok: false, error: 'duplicate-username', phase: 'unauthenticated' };
      }

      await this.persistCredentials(
        { username: input.username, password: input.password },
        input.email,
      );

      if (data.session && data.user) {
        // Email confirmation disabled — already authenticated.
        await this.ensureProfile(input, data.user.id);
        const issuedAt = Date.now();
        const { session } = await this.applySession(
          input.username,
          data.session.access_token,
          data.session.expires_at ?? Math.floor(issuedAt / 1000) + 3600,
          issuedAt,
          data.session.user.id,
        );
        return { ok: true, session, phase: 'authenticated' };
      }

      useUzzapStore.getState().setPhase('needs-pin');
      return { ok: true, phase: 'needs-pin' };
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'unauthenticated' };
    }
  }

  private async ensureProfile(
    input: RegisterInput,
    authUserId: string,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await supabase.from('profiles').upsert(
      {
        id: authUserId,
        username: input.username,
        display_name: input.displayName ?? input.username,
        phone_number: input.phoneNumber ?? null,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
        status: 'offline',
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'id' },
    );
  }

  /** Verify the 6-digit email OTP collected by the PIN screen. */
  async validatePin(pin: string): Promise<AuthResult> {
    // Already authenticated (autoconfirm projects) — nothing to verify.
    try {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        useUzzapStore.getState().setPhase('authenticated');
        return { ok: true, phase: 'authenticated' };
      }
    } catch {
      // fall through to OTP verification
    }

    const email = await this.getStoredEmail();
    if (!email) {
      return { ok: false, error: 'missing-credentials', phase: 'needs-pin' };
    }
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: pin.trim(),
        type: 'signup',
      });
      if (error) throw error;
      if (!data.session || !data.user) {
        return { ok: false, error: 'register-invalid-pin', phase: 'needs-pin' };
      }
      const credentials = await this.getStoredCredentials();
      await this.ensureProfile(
        {
          username: credentials?.username ?? email,
          password: '',
          email,
        },
        data.user.id,
      );
      // Backfill the username-appropriate display values on next login hydrate.
      const issuedAt = Date.now();
      const { session } = await this.applySession(
        credentials?.username ?? email,
        data.session.access_token,
        data.session.expires_at ?? Math.floor(issuedAt / 1000) + 3600,
        issuedAt,
        data.user.id,
      );
      return { ok: true, session, phase: 'authenticated' };
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'needs-pin' };
    }
  }

  /** UI-facing alias for {@link validatePin}. */
  async verifyPin(pin: string): Promise<AuthResult> {
    return this.validatePin(pin);
  }

  /** Resend the email OTP — the "resend code" affordance on the PIN screen. */
  async resendPin(_userId: string): Promise<AuthResult> {
    const email = await this.getStoredEmail();
    if (!email) {
      return { ok: false, error: 'missing-credentials', phase: 'needs-pin' };
    }
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      return { ok: true, phase: 'needs-pin' };
    } catch (error) {
      return { ok: false, error: toMessage(error), phase: 'needs-pin' };
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Session lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  async refreshToken(): Promise<AuthResult> {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      if (!data.session) throw new Error('missing-credentials');
      const credentials = await this.getStoredCredentials();
      const issuedAt = Date.now();
      const { session } = await this.applySession(
        credentials?.username ?? data.user?.email ?? 'me',
        data.session.access_token,
        data.session.expires_at ?? Math.floor(issuedAt / 1000) + 3600,
        issuedAt,
        data.session.user.id,
      );
      return { ok: true, session, phase: 'authenticated' };
    } catch {
      const credentials = await this.getStoredCredentials();
      if (!credentials) {
        return { ok: false, error: 'missing-credentials', phase: 'unauthenticated' };
      }
      return this.login(credentials.username, credentials.password);
    }
  }

  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch {
      // Best effort — local wipe below is what matters.
    }
    await clearSecureStore();
    useUzzapStore.getState().signOut();
  }

  /** Restore the Supabase session at cold start (refreshes when expired). */
  async restoreSession(): Promise<AuthSession | null> {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      const credentials = await this.getStoredCredentials();
      const issuedAt = Date.now();
      const { session } = await this.applySession(
        credentials?.username ?? data.session.user.email ?? 'me',
        data.session.access_token,
        data.session.expires_at ?? Math.floor(issuedAt / 1000) + 3600,
        issuedAt,
        data.session.user.id,
      );
      return session;
    } catch {
      return null;
    }
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
