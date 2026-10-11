import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateCreator } from 'zustand';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import { deleteSecureItem, getSecureItem, setSecureJson } from '../storage/secureStorage';
import { hotKV } from '../storage/mmkv';
import type {
  AppSettings,
  AuthPhase,
  Buddy,
  Conversation,
  Message,
  ChatRoom,
  ChatRoomUser,
  ChatMessage,
  ChatInvite,
} from '../types/models';
import type { ConnectionState, PresenceStatus } from '../types/protocol';
import { createAuthSlice } from './slices/authSlice';
import type { AuthSlice, AuthTokens, StoredUser } from './slices/authSlice';
import { createContactsSlice } from './slices/contactsSlice';
import type { ContactsSlice } from './slices/contactsSlice';
import { createMessagesSlice } from './slices/messagesSlice';
import type { MessagesSlice } from './slices/messagesSlice';
import { createPresenceSlice } from './slices/presenceSlice';
import type { BuddyPresence, PresenceSlice } from './slices/presenceSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import type { SettingsSlice } from './slices/settingsSlice';
import { createChatRoomsSlice } from './slices/chatRoomsSlice';
import type { ChatRoomsSlice } from './slices/chatRoomsSlice';

export * from './slices/authSlice';
export * from './slices/contactsSlice';
export * from './slices/messagesSlice';
export * from './slices/settingsSlice';
export * from './slices/presenceSlice';
export * from './slices/chatRoomsSlice';

/* -------------------------------------------------------------------------- */
/* Root state                                                                 */
/* -------------------------------------------------------------------------- */

export type UzzapState = AuthSlice &
  ContactsSlice &
  MessagesSlice &
  SettingsSlice &
  PresenceSlice &
  ChatRoomsSlice;

/**
 * Slice creator typed against the full root state and the middleware stack
 * (`devtools(persist(immer(...)))`). Each slice is authored as
 * `createXSlice: UzzapSlice<XSlice> = (set, get) => ({ ... })`.
 */
export type UzzapSlice<T> = StateCreator<
  UzzapState,
  [['zustand/devtools', never], ['zustand/persist', unknown], ['zustand/immer', never]],
  [],
  T
>;

/* -------------------------------------------------------------------------- */
/* Persistence — field-routed hybrid storage                                  */
/* -------------------------------------------------------------------------- */

export const STORE_NAME = 'uzzap.store.v1';

const AUTH_SUFFIX = '.auth';
const HOT_SUFFIX = '.hot';

/**
 * Subset of the store that survives a cold start. Everything else (message
 * caches, transient sync flags, typing state) is rehydrated from SQLite or the
 * network.
 */
export type PersistedState = Pick<
  UzzapState,
  | 'user'
  | 'tokens'
  | 'phase'
  | 'settings'
  | 'buddies'
  | 'groups'
  | 'lastRosterSync'
  | 'conversations'
  | 'selfStatus'
  | 'selfStatusMessage'
  | 'presence'
>;

/** Auth fields go to SecureStore, never to plain storage. */
const AUTH_FIELDS = new Set<string>(['user', 'tokens', 'phase']);
/** Hot-path fields go to MMKV (synchronous, cheap writes). */
const HOT_FIELDS = new Set<string>(['selfStatus', 'selfStatusMessage', 'presence']);

function safeParse<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * A zustand `StateStorage` that transparently splits the persisted snapshot
 * across three backends:
 *
 *  - **SecureStore** — `user`, `tokens`, `phase` (secrets / session)
 *  - **MMKV** — `selfStatus`, `selfStatusMessage`, `presence` (hot paths)
 *  - **AsyncStorage** — everything else (settings, roster, conversations)
 *
 * Writes are fire-and-forget from zustand's perspective, so the returned
 * promises are awaited inside `setItem` only to sequence the split writes.
 */
export const hybridStorage: StateStorage = {
  getItem: async (name) => {
    const [mainRaw, authRaw] = await Promise.all([
      AsyncStorage.getItem(name),
      getSecureItem(`${name}${AUTH_SUFFIX}`),
    ]);
    const hotRaw = hotKV.getString(`${name}${HOT_SUFFIX}`);

    const merged: Record<string, unknown> = {
      ...(safeParse<Record<string, unknown>>(mainRaw) ?? {}),
      ...(safeParse<Record<string, unknown>>(authRaw) ?? {}),
      ...(safeParse<Record<string, unknown>>(hotRaw) ?? {}),
    };

    return Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
  },

  setItem: async (name, value) => {
    const parsed = safeParse<Record<string, unknown>>(value) ?? {};

    const main: Record<string, unknown> = {};
    const auth: Record<string, unknown> = {};
    const hot: Record<string, unknown> = {};

    for (const [key, fieldValue] of Object.entries(parsed)) {
      if (AUTH_FIELDS.has(key)) auth[key] = fieldValue;
      else if (HOT_FIELDS.has(key)) hot[key] = fieldValue;
      else main[key] = fieldValue;
    }

    const writes: Promise<unknown>[] = [AsyncStorage.setItem(name, JSON.stringify(main))];

    if (Object.keys(auth).length > 0) {
      writes.push(setSecureJson(`${name}${AUTH_SUFFIX}`, auth));
    } else {
      writes.push(deleteSecureItem(`${name}${AUTH_SUFFIX}`));
    }

    if (Object.keys(hot).length > 0) {
      hotKV.set(`${name}${HOT_SUFFIX}`, JSON.stringify(hot));
    } else {
      hotKV.delete(`${name}${HOT_SUFFIX}`);
    }

    await Promise.all(writes);
  },

  removeItem: async (name) => {
    hotKV.delete(`${name}${HOT_SUFFIX}`);
    await Promise.all([AsyncStorage.removeItem(name), deleteSecureItem(`${name}${AUTH_SUFFIX}`)]);
  },
};

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

const createRootState: UzzapSlice<UzzapState> = (...args) => ({
  ...createAuthSlice(...args),
  ...createContactsSlice(...args),
  ...createMessagesSlice(...args),
  ...createSettingsSlice(...args),
  ...createPresenceSlice(...args),
  ...createChatRoomsSlice(...args),
});

export const useUzzapStore = create<UzzapState>()(
  devtools(
    persist(immer(createRootState), {
      name: STORE_NAME,
      version: 1,
      storage: createJSONStorage<PersistedState>(() => hybridStorage),
      partialize: (state): PersistedState => ({
        user: state.user,
        tokens: state.tokens,
        phase: state.phase,
        settings: state.settings,
        buddies: state.buddies,
        groups: state.groups,
        lastRosterSync: state.lastRosterSync,
        conversations: state.conversations,
        selfStatus: state.selfStatus,
        selfStatusMessage: state.selfStatusMessage,
        presence: state.presence,
      }),
      migrate: (persisted) => persisted as PersistedState,
    }),
    { name: 'uzzap', enabled: __DEV__ },
  ),
);

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

export const selectUser = (state: UzzapState): StoredUser | null => state.user;
export const selectTokens = (state: UzzapState): AuthTokens | null => state.tokens;
export const selectAuthPhase = (state: UzzapState): AuthPhase => state.phase;
export const selectIsLoggingIn = (state: UzzapState): boolean => state.isLoggingIn;
export const selectLoginError = (state: UzzapState): string | null => state.loginError;

export const selectSettings = (state: UzzapState): AppSettings => state.settings;
export const selectTheme = (state: UzzapState): AppSettings['theme'] => state.settings.theme;

export const selectBuddies = (state: UzzapState): Record<string, Buddy> => state.buddies;
/** @deprecated prefer {@link selectBuddies}. */
export const selectContacts = selectBuddies;
export const selectGroups = (state: UzzapState): string[] => state.groups;

export const selectConversations = (state: UzzapState): Record<string, Conversation> =>
  state.conversations;
export const selectActiveConversationId = (state: UzzapState): string | null =>
  state.activeConversationId;

export const selectSelfStatus = (state: UzzapState): PresenceStatus => state.selfStatus;
export const selectPresence = (state: UzzapState): Record<string, BuddyPresence> => state.presence;
export const selectTyping = (state: UzzapState): Record<string, boolean> => state.typing;
export const selectConnectionState = (state: UzzapState): ConnectionState => state.connectionState;

export function selectConversation(conversationId: string) {
  return (state: UzzapState): Conversation | undefined => state.conversations[conversationId];
}

export function selectConversationMessages(conversationId: string) {
  return (state: UzzapState): Message[] => state.messagesByConversation[conversationId] ?? [];
}

export function selectChatRoom(roomId: string) {
  return (state: UzzapState): ChatRoom | undefined => state.chatRooms[roomId];
}

export function selectChatRoomUsers(roomId: string) {
  return (state: UzzapState): ChatRoomUser[] =>
    Object.values(state.chatRoomUsers).filter((u) => u.roomId === roomId);
}

export function selectChatRoomMessages(roomId: string) {
  return (state: UzzapState): ChatMessage[] => state.chatMessagesByRoom[roomId] ?? [];
}

export function selectChatInvites(state: UzzapState): ChatInvite[] {
  return state.chatInvites;
}

/** Derived view of the active session, mirroring the legacy `AuthSession`. */
export function selectSession(state: UzzapState) {
  if (!state.user) return null;
  return {
    userId: state.user.id,
    displayName:
      [state.user.firstName, state.user.lastName].filter(Boolean).join(' ') || state.user.id,
    token: state.tokens?.accessToken,
    phase: state.phase,
  };
}
