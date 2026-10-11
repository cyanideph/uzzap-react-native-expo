import type { AuthPhase } from '../../types/models';
import type { UzzapSlice } from '../index';

/** Local account record mirrored from the `users` table. */
export interface StoredUser {
  id: string;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: number;
  lastLogin: number | null;
}

/** Auth tokens. Kept out of AsyncStorage — persisted to SecureStore only. */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch seconds. */
  expiresAt?: number;
}

export interface AuthSlice {
  /** Signed-in local user, or `null` when logged out. */
  user: StoredUser | null;
  /** Session tokens (never persisted to plain storage). */
  tokens: AuthTokens | null;
  /** High-level auth state-machine phase. */
  phase: AuthPhase;
  /** True while a login/registration request is in flight. */
  isLoggingIn: boolean;
  /** Last login failure message, cleared on a new attempt. */
  loginError: string | null;

  setUser: (user: StoredUser | null) => void;
  setTokens: (tokens: AuthTokens | null) => void;
  setPhase: (phase: AuthPhase) => void;
  setLoggingIn: (isLoggingIn: boolean) => void;
  setLoginError: (message: string | null) => void;
  /** Clear all session-bound state (auth + cached roster/messages). */
  signOut: () => void;
}

export const createAuthSlice: UzzapSlice<AuthSlice> = (set) => ({
  user: null,
  tokens: null,
  phase: 'unknown',
  isLoggingIn: false,
  loginError: null,

  setUser: (user) =>
    set((state) => {
      state.user = user;
    }),

  setTokens: (tokens) =>
    set((state) => {
      state.tokens = tokens;
    }),

  setPhase: (phase) =>
    set((state) => {
      state.phase = phase;
    }),

  setLoggingIn: (isLoggingIn) =>
    set((state) => {
      state.isLoggingIn = isLoggingIn;
    }),

  setLoginError: (loginError) =>
    set((state) => {
      state.loginError = loginError;
    }),

  signOut: () =>
    set((state) => {
      state.user = null;
      state.tokens = null;
      state.phase = 'unauthenticated';
      state.isLoggingIn = false;
      state.loginError = null;

      // Reset session-bound slices so no data leaks between accounts.
      state.buddies = {};
      state.groups = [];
      state.isSyncingRoster = false;
      state.lastRosterSync = null;

      state.conversations = {};
      state.messagesByConversation = {};
      state.activeConversationId = null;

      state.selfStatus = 'offline';
      state.selfStatusMessage = null;
      state.presence = {};
      state.typing = {};
      state.connectionState = 'idle';
    }),
});
