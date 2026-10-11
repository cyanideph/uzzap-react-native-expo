import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import * as authService from '../services/authService';
import { startAuthenticatedSession } from '../services/bootstrap';
import { useUzzapStore } from '../store';
import type { AuthTokens, StoredUser } from '../store/slices/authSlice';
import type { AuthPhase } from '../types/models';

/** High-level session state consumed by the route guards. */
export type AuthStatus = 'loading' | 'signed-out' | 'needs-pin' | 'signed-in';

/** Credentials + preferences gathered by the login form. */
export interface LoginInput {
  userId: string;
  password: string;
  rememberMe?: boolean;
  autoLogin?: boolean;
}

/** Account fields gathered by the multi-step registration form. */
export interface RegisterAccountInput {
  userId: string;
  mobile: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  phase: AuthPhase;
  user: StoredUser | null;
  tokens: AuthTokens | null;
  isLoggingIn: boolean;
  loginError: string | null;
  signIn: (input: LoginInput) => Promise<authService.AuthResult>;
  register: (input: RegisterAccountInput) => Promise<authService.AuthResult>;
  verifyPin: (pin: string) => Promise<authService.AuthResult>;
  resendPin: (userId: string) => Promise<authService.AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Bridges the persisted zustand auth slice + SecureStore into a single
 * `AuthStatus` the router can guard on.
 *
 * - waits for zustand `persist` hydration before deciding anything;
 * - runs one `restoreSession()` pass (auto-login when configured);
 * - exposes the auth service actions bound for convenience.
 */
export function AuthProvider({ children }: PropsWithChildren): React.ReactElement {
  const user = useUzzapStore((state) => state.user);
  const tokens = useUzzapStore((state) => state.tokens);
  const phase = useUzzapStore((state) => state.phase);
  const isLoggingIn = useUzzapStore((state) => state.isLoggingIn);
  const loginError = useUzzapStore((state) => state.loginError);

  const [hydrated, setHydrated] = useState<boolean>(() => useUzzapStore.persist.hasHydrated());
  const [restored, setRestored] = useState(false);

  // Wait until zustand has rehydrated the persisted slice.
  useEffect(() => {
    if (hydrated) return;
    if (useUzzapStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsubscribe = useUzzapStore.persist.onFinishHydration(() => setHydrated(true));
    return unsubscribe;
  }, [hydrated]);

  // Run the one-shot session restore.
  useEffect(() => {
    if (!hydrated || restored) return;
    let active = true;
    void (async () => {
      try {
        await authService.restoreSession();
      } finally {
        if (active) setRestored(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [hydrated, restored]);

  const status = useMemo<AuthStatus>(() => {
    if (!hydrated || !restored) return 'loading';
    if (phase === 'authenticated' && user && tokens) return 'signed-in';
    if (phase === 'needs-pin' && user) return 'needs-pin';
    return 'signed-out';
  }, [hydrated, restored, phase, user, tokens]);

  // Once a session exists (restored at cold start or established by login),
  // load persisted settings, reconnect the transport, register for push and
  // hydrate the local SQLite caches into the store.
  useEffect(() => {
    if (status !== 'signed-in') return;
    void startAuthenticatedSession();
  }, [status]);

  const signIn = useCallback<AuthContextValue['signIn']>(async (input) => {
    const result = await authService.login(input.userId, input.password);
    if (result.ok) {
      if (input.rememberMe) await authService.rememberCredentials(input.userId);
      else await authService.forgetCredentials();
      if (typeof input.autoLogin === 'boolean') {
        useUzzapStore.getState().updateSettings({ autoLogin: input.autoLogin });
      }
    }
    return result;
  }, []);

  const register = useCallback<AuthContextValue['register']>(
    (input) =>
      authService.register({
        username: input.userId,
        password: input.password,
        phoneNumber: input.mobile,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      }),
    [],
  );

  const verifyPin = useCallback<AuthContextValue['verifyPin']>(async (pin) => {
    const result = await authService.validatePin(pin);
    if (!result.ok) return result;
    // `validatePin` only advances the phase. Establish the persisted session
    // (user + tokens) so the route guards can let the user in.
    const credentials = await authService.getStoredCredentials();
    if (!credentials) return result;
    return authService.login(credentials.username, credentials.password);
  }, []);

  const resendPin = useCallback<AuthContextValue['resendPin']>(
    (userId) => authService.resendPin(userId),
    [],
  );

  const signOut = useCallback<AuthContextValue['signOut']>(() => authService.logout(), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      phase,
      user,
      tokens,
      isLoggingIn,
      loginError,
      signIn,
      register,
      verifyPin,
      resendPin,
      signOut,
    }),
    [
      status,
      phase,
      user,
      tokens,
      isLoggingIn,
      loginError,
      signIn,
      register,
      verifyPin,
      resendPin,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access session state + auth actions. Must be used within `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth() must be used within an <AuthProvider>.');
  }
  return context;
}
