import type { ConnectionState, PresenceStatus } from '../../types/protocol';
import type { UzzapSlice } from '../index';

/** Cached presence for a single buddy. */
export interface BuddyPresence {
  status: PresenceStatus;
  statusMessage?: string;
  /** Epoch seconds. */
  lastSeen?: number;
  /** Epoch seconds of the last update. */
  updatedAt: number;
}

export interface PresenceSlice {
  /** Own advertised presence. */
  selfStatus: PresenceStatus;
  selfStatusMessage: string | null;
  /** Remote presence keyed by userId (hot path, persisted to MMKV). */
  presence: Record<string, BuddyPresence>;
  /** Typing indicators keyed by userId (hot path, persisted to MMKV). */
  typing: Record<string, boolean>;
  /** Socket/engine connection state. */
  connectionState: ConnectionState;

  setSelfStatus: (status: PresenceStatus) => void;
  setSelfStatusMessage: (message: string | null) => void;

  setPresence: (userId: string, presence: BuddyPresence) => void;
  setPresenceBulk: (entries: Record<string, BuddyPresence>) => void;
  clearPresence: (userId: string) => void;

  setTyping: (userId: string, isTyping: boolean) => void;
  clearTyping: (userId?: string) => void;

  setConnectionState: (state: ConnectionState) => void;
}

export const createPresenceSlice: UzzapSlice<PresenceSlice> = (set) => ({
  selfStatus: 'offline',
  selfStatusMessage: null,
  presence: {},
  typing: {},
  connectionState: 'idle',

  setSelfStatus: (selfStatus) =>
    set((state) => {
      state.selfStatus = selfStatus;
    }),

  setSelfStatusMessage: (selfStatusMessage) =>
    set((state) => {
      state.selfStatusMessage = selfStatusMessage;
    }),

  setPresence: (userId, presence) =>
    set((state) => {
      state.presence[userId] = presence;
    }),

  setPresenceBulk: (entries) =>
    set((state) => {
      for (const [userId, presence] of Object.entries(entries)) {
        state.presence[userId] = presence;
      }
    }),

  clearPresence: (userId) =>
    set((state) => {
      delete state.presence[userId];
      delete state.typing[userId];
    }),

  setTyping: (userId, isTyping) =>
    set((state) => {
      if (isTyping) state.typing[userId] = true;
      else delete state.typing[userId];
    }),

  clearTyping: (userId) =>
    set((state) => {
      if (userId) {
        delete state.typing[userId];
        return;
      }
      state.typing = {};
    }),

  setConnectionState: (connectionState) =>
    set((state) => {
      state.connectionState = connectionState;
    }),
});
