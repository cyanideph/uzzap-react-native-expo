import { eq } from 'drizzle-orm';
import * as Contacts from 'expo-contacts';

import { db } from '../db/client';
import { buddies as buddiesTable } from '../db/schema';
import type { BuddyRow } from '../db/schema';
import { useUzzapStore } from '../store';
import type { Buddy } from '../types/models';
import type { PresenceStatus, Stanza } from '../types/protocol';
import { buildIq, buildVCard, newIqId, wsClient } from './wsClient';
import type { VCardData } from './wsClient';

/**
 * Roster / contact management.
 *
 * The zustand `buddies` slice is the primary in-memory + persisted store (it
 * keeps `amazCid`, which the SQLite mirror omits because the `buddies` table
 * predates it). SQLite (`buddies`) is used as a durable searchable cache.
 *
 * Remote operations map to the `registry` protocol actions (spec §7):
 * `query-roster`, `save-contact`, `delete-contact`, `rename-group`,
 * `init-store-contact` / `store-contact`.
 */

export interface ContactInput {
  userId: string;
  displayName?: string;
  phoneNumber?: string;
  email?: string;
  groups?: string[];
  amazCid?: string;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function parseGroups(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
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

export class ContactService {
  constructor() {
    wsClient.addListener((event) => {
      if (event.type === 'roster') void this.handleRoster(event.stanza);
    });
  }

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

    this.sendRegistryAction('save-contact', {
      username: buddy.userId,
      amazCid: buddy.amazCid,
      displayname: buddy.displayName,
      phone: buddy.phoneNumber,
      email: input.email,
      groups: buddy.groups,
    });

    useUzzapStore.getState().upsertBuddy(buddy);
    await this.persistBuddies([buddy], now);
    return buddy;
  }

  async updateContact(input: ContactInput): Promise<Buddy> {
    return this.saveContact(input);
  }

  async deleteContact(userId: string): Promise<void> {
    const buddy = this.getContact(userId);
    this.sendRegistryAction('delete-contact', {
      amazCid: buddy?.amazCid ?? userId,
      username: buddy?.amazCid ? undefined : userId,
    });

    useUzzapStore.getState().removeBuddy(userId);
    await db.delete(buddiesTable).where(eq(buddiesTable.userId, userId)).run();
  }

  async blockContact(userId: string, isBlocked: boolean): Promise<void> {
    const buddy = this.getContact(userId);
    if (!buddy) return;
    const updated: Buddy = { ...buddy, isBlocked };
    useUzzapStore.getState().upsertBuddy(updated);
    await this.persistBuddies([updated]);
    this.sendRegistryAction('save-contact', {
      username: userId,
      amazCid: buddy.amazCid,
      displayname: buddy.displayName,
      extra: { blocked: isBlocked ? 'yes' : 'no' },
    });
  }

  async renameGroup(oldName: string, newName: string): Promise<void> {
    const id = newIqId('REG');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'rename-group',
        target: '___registry___',
        amazProtocol: 'registry',
        vcard: { groups: [oldName], extra: { 'new-name': newName } },
      }),
    );

    const store = useUzzapStore.getState();
    store.setGroups(store.groups.map((group) => (group === oldName ? newName : group)));
    for (const buddy of Object.values(store.buddies)) {
      if (!buddy.groups.includes(oldName)) continue;
      store.upsertBuddy({
        ...buddy,
        groups: buddy.groups.map((group) => (group === oldName ? newName : group)),
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Roster sync                                                            */
  /* ---------------------------------------------------------------------- */

  async syncRoster(): Promise<Buddy[]> {
    const store = useUzzapStore.getState();
    store.setSyncingRoster(true);
    const wait = this.waitForRoster(12_000);
    wsClient.sendRosterQuery();
    const stanza = await wait;
    store.setSyncingRoster(false);
    if (stanza) return this.handleRoster(stanza);
    return this.listContacts();
  }

  async handleRoster(stanza: Stanza): Promise<Buddy[]> {
    const store = useUzzapStore.getState();
    const arrays = stanza.arrays;
    const usernames = arrays['iq/vcard/username'] ?? [];
    const cids = arrays['iq/vcard/amaz-cid'] ?? [];
    const displayNames = arrays['iq/vcard/displayname'] ?? [];
    const phones = arrays['iq/vcard/phone'] ?? [];
    const groups = arrays['iq/vcard/groups'] ?? [];

    const list: Buddy[] = usernames.map((username, index) => {
      const existing = store.buddies[username];
      return {
        userId: username,
        displayName: displayNames[index] ?? username,
        phoneNumber: phones[index],
        status: existing?.status ?? ('offline' as PresenceStatus),
        statusMessage: existing?.statusMessage,
        isBlocked: existing?.isBlocked ?? false,
        isUzzapUser: true,
        lastSeen: existing?.lastSeen,
        avatar: existing?.avatar,
        groups: parseGroups(groups[index]),
        amazCid: cids[index],
      };
    });

    if (list.length > 0) {
      store.upsertBuddies(list);
      const allGroups = new Set(store.groups);
      for (const buddy of list) for (const group of buddy.groups) allGroups.add(group);
      store.setGroups([...allGroups]);
      store.setLastRosterSync(Math.floor(Date.now() / 1000));
      await this.persistBuddies(list);
    }
    return list;
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
    const vcards: VCardData[] = [];
    let matched = 0;

    for (const contact of data) {
      const phone = contact.phoneNumbers?.[0]?.number;
      if (!phone) continue;
      const normalized = normalizePhone(phone);
      if (!normalized) continue;
      const match = Object.values(existing).find(
        (buddy) => buddy.phoneNumber && normalizePhone(buddy.phoneNumber) === normalized,
      );
      if (match) matched += 1;
      vcards.push({
        username: match?.userId ?? normalized,
        displayname: contact.name ?? normalized,
        phone: normalized,
      });
    }

    if (vcards.length === 0) return { uploaded: 0, matched };
    await this.uploadContacts(vcards);
    return { uploaded: vcards.length, matched };
  }

  private async uploadContacts(vcards: VCardData[]): Promise<void> {
    wsClient.sendIq(
      buildIq({
        id: newIqId('REG'),
        type: 'set',
        action: 'init-store-contact',
        target: 'registry',
        amazProtocol: 'registry',
      }),
    );
    const children = vcards.map((vcard) => buildVCard(vcard)).join('');
    wsClient.sendIq(
      buildIq({
        id: newIqId('REG'),
        type: 'set',
        action: 'store-contact',
        target: 'registry',
        amazProtocol: 'registry',
        children,
      }),
    );
    await Promise.resolve();
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private sendRegistryAction(action: string, vcard: VCardData): void {
    wsClient.sendIq(
      buildIq({
        id: newIqId('REG'),
        type: 'set',
        action,
        target: 'registry',
        amazProtocol: 'registry',
        vcard,
      }),
    );
  }

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

export const contactService = new ContactService();

export const listContacts = (): Buddy[] => contactService.listContacts();
export const searchContacts = (query: string): Buddy[] => contactService.searchContacts(query);
export const saveContact = (input: ContactInput): Promise<Buddy> =>
  contactService.saveContact(input);
export const deleteContact = (userId: string): Promise<void> =>
  contactService.deleteContact(userId);
export const syncRoster = (): Promise<Buddy[]> => contactService.syncRoster();
export const syncPhoneContacts = (): Promise<{ uploaded: number; matched: number }> =>
  contactService.syncPhoneContacts();
