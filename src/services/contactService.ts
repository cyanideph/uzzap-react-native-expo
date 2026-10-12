import { eq } from 'drizzle-orm';
import * as Contacts from 'expo-contacts';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { db } from '../db/client';
import { buddies as buddiesTable } from '../db/schema';
import type { BuddyRow } from '../db/schema';
import { useUzzapStore } from '../store';
import type { Buddy } from '../types/models';
import type { PresenceStatus } from '../types/protocol';
import { supabase } from './supabaseClient';

/**
 * Roster / contact management on Supabase (`buddies` table).
 *
 * The zustand `buddies` slice stays the primary in-memory store. SQLite
 * (`buddies`) remains a durable searchable cache. The server of record is
 * now Supabase Postgres instead of the legacy `registry` IQ protocol, and
 * roster changes arrive over a Realtime channel instead of `query-roster`.
 *
 * Public API is unchanged so screens keep working without modification.
 */

export interface ContactInput {
  userId: string;
  displayName?: string;
  phoneNumber?: string;
  email?: string;
  groups?: string[];
  amazCid?: string;
}

interface BuddyDbRow {
  buddy_id: string;
  display_name: string;
  phone_number: string | null;
  status: PresenceStatus;
  status_message: string | null;
  is_blocked: boolean;
  is_uzzap_user: boolean;
  last_seen: number | null;
  avatar: string | null;
  groups: string[];
  amaz_cid: string | null;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function toBuddy(row: BuddyDbRow, fallback?: Buddy): Buddy {
  return {
    userId: row.buddy_id,
    displayName: row.display_name || fallback?.displayName || row.buddy_id,
    phoneNumber: row.phone_number ?? fallback?.phoneNumber,
    status: row.status ?? fallback?.status ?? 'offline',
    statusMessage: row.status_message ?? fallback?.statusMessage,
    isBlocked: row.is_blocked ?? fallback?.isBlocked ?? false,
    isUzzapUser: row.is_uzzap_user ?? true,
    lastSeen: row.last_seen ?? fallback?.lastSeen,
    avatar: row.avatar ?? fallback?.avatar,
    groups: row.groups ?? fallback?.groups ?? [],
    amazCid: row.amaz_cid ?? fallback?.amazCid,
  };
}

function rowFromDb(row: BuddyRow, amazCid: string | undefined): Buddy {
  return {
    userId: row.userId,
    displayName: row.displayName,
    phoneNumber: row.phoneNumber ?? undefined,
    status: row.status,
    statusMessage: row.statusMessage ?? undefined,
    isBlocked: row.isBlocked,
    isUzzapUser: row.isUzzapUser,
    lastSeen: row.lastSeen ?? undefined,
    avatar: row.avatar ?? undefined,
    groups: row.groups,
    amazCid,
  };
}

async function ownerId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export class ContactService {
  private rosterChannel: RealtimeChannel | null = null;

  /* ---------------------------------------------------------------------- */
  /* Local reads                                                            */
  /* ---------------------------------------------------------------------- */

  listContacts(): Buddy[] {
    return Object.values(useUzzapStore.getState().buddies);
  }

  getContact(userId: string): Buddy | undefined {
    return useUzzapStore.getState().buddies[userId];
  }

  searchContacts(query: string): Buddy[] {
    const normalized = query.trim().toLowerCase();
    const all = this.listContacts();
    if (normalized.length === 0) return all;
    return all.filter(
      (buddy) =>
        buddy.userId.toLowerCase().includes(normalized) ||
        buddy.displayName.toLowerCase().includes(normalized) ||
        (buddy.phoneNumber ?? '').includes(normalized),
    );
  }

  getGroups(): string[] {
    return useUzzapStore.getState().groups;
  }

  /** Restore the SQLite roster cache into the store (preserving `amazCid`). */
  async hydrateFromDatabase(): Promise<Buddy[]> {
    const rows = await db.select().from(buddiesTable).all();
    const current = useUzzapStore.getState().buddies;
    const list = rows.map((row) => rowFromDb(row, current[row.userId]?.amazCid));
    useUzzapStore.getState().upsertBuddies(list);
    return list;
  }

  /* ---------------------------------------------------------------------- */
  /* Remote writes                                                          */
  /* ---------------------------------------------------------------------- */

  async saveContact(input: ContactInput): Promise<Buddy> {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.getContact(input.userId);
    const buddy: Buddy = {
      userId: input.userId,
      displayName: input.displayName ?? existing?.displayName ?? input.userId,
      phoneNumber: input.phoneNumber ?? existing?.phoneNumber,
      status: existing?.status ?? 'offline',
      statusMessage: existing?.statusMessage,
      isBlocked: existing?.isBlocked ?? false,
      isUzzapUser: true,
      lastSeen: existing?.lastSeen,
      avatar: existing?.avatar,
      groups: input.groups ?? existing?.groups ?? [],
      amazCid: input.amazCid ?? existing?.amazCid,
    };

    const owner = await ownerId();
    if (owner) {
      await supabase.from('buddies').upsert(
        {
          owner_id: owner,
          buddy_id: buddy.userId,
          display_name: buddy.displayName,
          phone_number: buddy.phoneNumber ?? null,
          status: buddy.status,
          status_message: buddy.statusMessage ?? null,
          is_blocked: buddy.isBlocked,
          is_uzzap_user: buddy.isUzzapUser,
          last_seen: buddy.lastSeen ?? null,
          avatar: buddy.avatar ?? null,
          groups: buddy.groups,
          amaz_cid: buddy.amazCid ?? null,
          updated_at: now,
        },
        { onConflict: 'owner_id,buddy_id' },
      );
    }

    useUzzapStore.getState().upsertBuddy(buddy);
    await this.persistBuddies([buddy], now);
    return buddy;
  }

  async updateContact(input: ContactInput): Promise<Buddy> {
    return this.saveContact(input);
  }

  async deleteContact(userId: string): Promise<void> {
    const owner = await ownerId();
    if (owner) {
      await supabase.from('buddies').delete().eq('owner_id', owner).eq('buddy_id', userId);
    }

    useUzzapStore.getState().removeBuddy(userId);
    await db.delete(buddiesTable).where(eq(buddiesTable.userId, userId)).run();
  }

  async blockContact(userId: string, isBlocked: boolean): Promise<void> {
    const buddy = this.getContact(userId);
    if (!buddy) return;
    const updated: Buddy = { ...buddy, isBlocked };
    const owner = await ownerId();
    if (owner) {
      await supabase
        .from('buddies')
        .update({ is_blocked: isBlocked, updated_at: Math.floor(Date.now() / 1000) })
        .eq('owner_id', owner)
        .eq('buddy_id', userId);
    }
    useUzzapStore.getState().upsertBuddy(updated);
    await this.persistBuddies([updated]);
  }

  async renameGroup(oldName: string, newName: string): Promise<void> {
    const store = useUzzapStore.getState();
    const owner = await ownerId();
    const now = Math.floor(Date.now() / 1000);
    const affected = Object.values(store.buddies).filter((b) => b.groups.includes(oldName));

    if (owner) {
      for (const buddy of affected) {
        const groups = buddy.groups.map((g) => (g === oldName ? newName : g));
        await supabase
          .from('buddies')
          .update({ groups, updated_at: now })
          .eq('owner_id', owner)
          .eq('buddy_id', buddy.userId);
      }
    }

    store.setGroups(store.groups.map((group) => (group === oldName ? newName : group)));
    for (const buddy of affected) {
      store.upsertBuddy({
        ...buddy,
        groups: buddy.groups.map((group) => (group === oldName ? newName : group)),
      });
    }
    await this.persistBuddies(
      affected.map((b) => ({
        ...b,
        groups: b.groups.map((group) => (group === oldName ? newName : group)),
      })),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Roster sync                                                            */
  /* ---------------------------------------------------------------------- */

  async syncRoster(): Promise<Buddy[]> {
    const store = useUzzapStore.getState();
    store.setSyncingRoster(true);
    try {
      const owner = await ownerId();
      if (!owner) return this.listContacts();
      const { data, error } = await supabase
        .from('buddies')
        .select(
          'buddy_id, display_name, phone_number, status, status_message, is_blocked, is_uzzap_user, last_seen, avatar, groups, amaz_cid',
        )
        .eq('owner_id', owner);
      if (error) throw error;
      const list: Buddy[] = (data ?? []).map((row) =>
        toBuddy(row as unknown as BuddyDbRow, store.buddies[(row as unknown as BuddyDbRow).buddy_id]),
      );
      if (list.length > 0) {
        store.upsertBuddies(list);
        const allGroups = new Set(store.groups);
        for (const buddy of list) for (const group of buddy.groups) allGroups.add(group);
        store.setGroups([...allGroups]);
        store.setLastRosterSync(Math.floor(Date.now() / 1000));
        await this.persistBuddies(list);
      }
      return list;
    } catch {
      return this.listContacts();
    } finally {
      store.setSyncingRoster(false);
    }
  }

  /** Live roster updates for the signed-in owner. Idempotent. */
  subscribeRoster(): () => void {
    if (this.rosterChannel) return () => undefined;
    const channel = supabase
      .channel('roster')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buddies' },
        (payload) => {
          void this.handleRosterChange(
            payload.eventType as string,
            (payload.new ?? payload.old ?? {}) as Record<string, unknown>,
          );
        },
      )
      .subscribe();
    this.rosterChannel = channel;
    return () => {
      void supabase.removeChannel(channel);
      if (this.rosterChannel === channel) this.rosterChannel = null;
    };
  }

  unsubscribeRoster(): void {
    if (!this.rosterChannel) return;
    const channel = this.rosterChannel;
    this.rosterChannel = null;
    void supabase.removeChannel(channel);
  }

  private async handleRosterChange(
    eventType: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    const buddyId = row.buddy_id as string | undefined;
    if (!buddyId) return;
    const store = useUzzapStore.getState();
    if (eventType === 'DELETE') {
      store.removeBuddy(buddyId);
      await db.delete(buddiesTable).where(eq(buddiesTable.userId, buddyId)).run();
      return;
    }
    const buddy = toBuddy(row as unknown as BuddyDbRow, store.buddies[buddyId]);
    store.upsertBuddy(buddy);
    await this.persistBuddies([buddy]);
  }

  /* ---------------------------------------------------------------------- */
  /* Phone book sync                                                        */
  /* ---------------------------------------------------------------------- */

  async syncPhoneContacts(): Promise<{ uploaded: number; matched: number }> {
    let granted = false;
    try {
      const permission = await Contacts.requestPermissionsAsync();
      granted = permission.granted;
    } catch {
      return { uploaded: 0, matched: 0 };
    }
    if (!granted) return { uploaded: 0, matched: 0 };

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name],
    });

    const existing = useUzzapStore.getState().buddies;
    const now = Math.floor(Date.now() / 1000);
    let matched = 0;
    let uploaded = 0;

    for (const contact of data) {
      const phone = contact.phoneNumbers?.[0]?.number;
      if (!phone) continue;
      const normalized = normalizePhone(phone);
      if (!normalized) continue;
      const match = Object.values(existing).find(
        (buddy) => buddy.phoneNumber && normalizePhone(buddy.phoneNumber) === normalized,
      );
      if (match) matched += 1;
      const buddy: Buddy = {
        userId: match?.userId ?? normalized,
        displayName: contact.name ?? match?.displayName ?? normalized,
        phoneNumber: normalized,
        status: match?.status ?? 'offline',
        statusMessage: match?.statusMessage,
        isBlocked: match?.isBlocked ?? false,
        isUzzapUser: Boolean(match),
        lastSeen: match?.lastSeen,
        avatar: match?.avatar,
        groups: match?.groups ?? [],
        amazCid: match?.amazCid,
      };
      const owner = await ownerId();
      if (owner) {
        await supabase.from('buddies').upsert(
          {
            owner_id: owner,
            buddy_id: buddy.userId,
            display_name: buddy.displayName,
            phone_number: buddy.phoneNumber ?? null,
            status: buddy.status,
            status_message: buddy.statusMessage ?? null,
            is_blocked: buddy.isBlocked,
            is_uzzap_user: buddy.isUzzapUser,
            last_seen: buddy.lastSeen ?? null,
            avatar: buddy.avatar ?? null,
            groups: buddy.groups,
            amaz_cid: buddy.amazCid ?? null,
            updated_at: now,
          },
          { onConflict: 'owner_id,buddy_id' },
        );
      }
      useUzzapStore.getState().upsertBuddy(buddy);
      await this.persistBuddies([buddy], now);
      uploaded += 1;
    }
    return { uploaded, matched };
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private async persistBuddies(list: Buddy[], now = Math.floor(Date.now() / 1000)): Promise<void> {
    for (const buddy of list) {
      const values = {
        userId: buddy.userId,
        displayName: buddy.displayName,
        phoneNumber: buddy.phoneNumber ?? null,
        status: buddy.status,
        statusMessage: buddy.statusMessage ?? null,
        isBlocked: buddy.isBlocked,
        isUzzapUser: buddy.isUzzapUser,
        lastSeen: buddy.lastSeen ?? null,
        avatar: buddy.avatar ?? null,
        groups: buddy.groups,
        createdAt: now,
        updatedAt: now,
      };
      await db
        .insert(buddiesTable)
        .values(values)
        .onConflictDoUpdate({
          target: buddiesTable.userId,
          set: {
            displayName: values.displayName,
            phoneNumber: values.phoneNumber,
            status: values.status,
            statusMessage: values.statusMessage,
            isBlocked: values.isBlocked,
            isUzzapUser: values.isUzzapUser,
            lastSeen: values.lastSeen,
            avatar: values.avatar,
            groups: values.groups,
            updatedAt: now,
          },
        })
        .run();
    }
  }
}

export const contactService = new ContactService();

export const listContacts = (): Buddy[] => contactService.listContacts();
export const searchContacts = (query: string): Buddy[] => contactService.searchContacts(query);
export const saveContact = (input: ContactInput): Promise<Buddy> =>
  contactService.saveContact(input);
export const deleteContact = (userId: string): Promise<void> =>
  contactService.deleteContact(userId);
export const blockContact = (userId: string, isBlocked: boolean): Promise<void> =>
  contactService.blockContact(userId, isBlocked);
export const syncRoster = (): Promise<Buddy[]> => contactService.syncRoster();
export const syncPhoneContacts = (): Promise<{ uploaded: number; matched: number }> =>
  contactService.syncPhoneContacts();
