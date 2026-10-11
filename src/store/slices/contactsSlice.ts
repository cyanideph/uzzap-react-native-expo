import type { Buddy } from '../../types/models';
import type { PresenceStatus } from '../../types/protocol';
import type { UzzapSlice } from '../index';

export interface ContactsSlice {
  /** Roster keyed by buddy userId. */
  buddies: Record<string, Buddy>;
  /** All known buddy group names. */
  groups: string[];
  /** True while a roster sync is in flight. */
  isSyncingRoster: boolean;
  /** Epoch seconds of the last successful roster sync. */
  lastRosterSync: number | null;

  upsertBuddy: (buddy: Buddy) => void;
  upsertBuddies: (buddies: Buddy[]) => void;
  removeBuddy: (userId: string) => void;

  setBuddyStatus: (userId: string, status: PresenceStatus) => void;
  setBuddyStatusMessage: (userId: string, statusMessage: string) => void;
  setBuddyBlocked: (userId: string, isBlocked: boolean) => void;

  setGroups: (groups: string[]) => void;
  addBuddyToGroup: (userId: string, group: string) => void;
  removeBuddyFromGroup: (userId: string, group: string) => void;

  setSyncingRoster: (isSyncingRoster: boolean) => void;
  setLastRosterSync: (timestamp: number | null) => void;
}

export const createContactsSlice: UzzapSlice<ContactsSlice> = (set) => ({
  buddies: {},
  groups: [],
  isSyncingRoster: false,
  lastRosterSync: null,

  upsertBuddy: (buddy) =>
    set((state) => {
      state.buddies[buddy.userId] = buddy;
    }),

  upsertBuddies: (list) =>
    set((state) => {
      for (const buddy of list) {
        state.buddies[buddy.userId] = buddy;
      }
    }),

  removeBuddy: (userId) =>
    set((state) => {
      delete state.buddies[userId];
    }),

  setBuddyStatus: (userId, status) =>
    set((state) => {
      const buddy = state.buddies[userId];
      if (buddy) buddy.status = status;
    }),

  setBuddyStatusMessage: (userId, statusMessage) =>
    set((state) => {
      const buddy = state.buddies[userId];
      if (buddy) buddy.statusMessage = statusMessage;
    }),

  setBuddyBlocked: (userId, isBlocked) =>
    set((state) => {
      const buddy = state.buddies[userId];
      if (buddy) buddy.isBlocked = isBlocked;
    }),

  setGroups: (groups) =>
    set((state) => {
      state.groups = groups;
    }),

  addBuddyToGroup: (userId, group) =>
    set((state) => {
      const buddy = state.buddies[userId];
      if (!buddy) return;
      if (!buddy.groups.includes(group)) buddy.groups.push(group);
      if (!state.groups.includes(group)) state.groups.push(group);
    }),

  removeBuddyFromGroup: (userId, group) =>
    set((state) => {
      const buddy = state.buddies[userId];
      if (!buddy) return;
      buddy.groups = buddy.groups.filter((name) => name !== group);
    }),

  setSyncingRoster: (isSyncingRoster) =>
    set((state) => {
      state.isSyncingRoster = isSyncingRoster;
    }),

  setLastRosterSync: (lastRosterSync) =>
    set((state) => {
      state.lastRosterSync = lastRosterSync;
    }),
});
