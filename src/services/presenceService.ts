import { HOT_KEYS, hotKV } from '../storage/mmkv';
import { useUzzapStore } from '../store';
import type { BuddyPresence } from '../store/slices/presenceSlice';
import type { PresenceStatus, Stanza } from '../types/protocol';
import { buildIq, escapeXml, newIqId, wsClient } from './wsClient';

/**
 * Presence publish / subscribe.
 *
 * The legacy server has no standard XMPP `<presence>` negotiation: status is
 * published through the `registry` target (`status-update` / `update-idle-state`,
 * spec §6–§7) and buddy presence arrives as registry profile updates. Inbound
 * stanzas are normalised into {@link BuddyPresence} entries on the store.
 */

function toWireShow(status: PresenceStatus): string {
  switch (status) {
    case 'busy':
      return 'notavailable';
    case 'invisible':
    case 'offline':
      return 'offline';
    case 'away':
      return 'away';
    default:
      return 'available';
  }
}

function fromWireShow(value: string): PresenceStatus {
  switch (value) {
    case 'notavailable':
    case 'busy':
      return 'busy';
    case 'offline':
    case 'invisible':
      return 'offline';
    case 'away':
      return 'away';
    case 'freeforchat':
    case 'available':
      return 'available';
    default:
      return 'online';
  }
}

function readFirst(keys: Record<string, string>, candidates: readonly string[]): string {
  for (const key of candidates) {
    const value = keys[key];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

export class PresenceService {
  private readonly subscriptions = new Set<string>();

  constructor() {
    wsClient.addListener((event) => {
      if (event.type === 'presence') this.handlePresence(event.stanza);
      else if (event.type === 'state') {
        useUzzapStore.getState().setConnectionState(event.state);
        if (event.state === 'online') {
          useUzzapStore.getState().setSelfStatus(useUzzapStore.getState().selfStatus);
        }
      } else if (event.type === 'disconnect') {
        useUzzapStore.getState().setSelfStatus('offline');
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Publishing                                                             */
  /* ---------------------------------------------------------------------- */

  async publishStatus(status: PresenceStatus, statusMessage?: string): Promise<void> {
    const store = useUzzapStore.getState();
    store.setSelfStatus(status);
    store.setSelfStatusMessage(statusMessage ?? null);

    hotKV.set(
      HOT_KEYS.lastPresence,
      JSON.stringify({ status, statusMessage: statusMessage ?? null, updatedAt: Date.now() }),
    );

    if (!wsClient.isOnline()) return;

    const children =
      `<state>${escapeXml(toWireShow(status))}</state>` +
      (statusMessage ? `<status-message>${escapeXml(statusMessage)}</status-message>` : '');

    wsClient.sendIq(
      buildIq({
        id: newIqId('REG'),
        type: 'set',
        action: 'status-update',
        target: 'registry',
        amazProtocol: 'registry',
        children,
      }),
    );
    await Promise.resolve();
  }

  async publishOnline(statusMessage?: string): Promise<void> {
    return this.publishStatus('available', statusMessage);
  }

  async publishAway(statusMessage?: string): Promise<void> {
    return this.publishStatus('away', statusMessage);
  }

  async publishBusy(statusMessage?: string): Promise<void> {
    return this.publishStatus('busy', statusMessage);
  }

  async publishInvisible(): Promise<void> {
    return this.publishStatus('invisible');
  }

  /** `update-idle-state` (spec §10.4). */
  async setIdle(isIdle: boolean): Promise<void> {
    if (!wsClient.isOnline()) return;
    wsClient.sendIdleState(isIdle);
    await Promise.resolve();
  }

  /* ---------------------------------------------------------------------- */
  /* Subscriptions                                                          */
  /* ---------------------------------------------------------------------- */

  async subscribe(buddyId: string): Promise<void> {
    this.subscriptions.add(buddyId);
    if (!wsClient.isOnline()) return;
    wsClient.sendIq(
      buildIq({
        id: newIqId('REG'),
        type: 'get',
        action: 'query-profile',
        target: 'registry',
        amazProtocol: 'registry',
        vcard: { username: buddyId },
      }),
    );
    await Promise.resolve();
  }

  async unsubscribe(buddyId: string): Promise<void> {
    this.subscriptions.delete(buddyId);
    await Promise.resolve();
  }

  getSubscriptions(): string[] {
    return [...this.subscriptions];
  }

  /* ---------------------------------------------------------------------- */
  /* Inbound                                                                */
  /* ---------------------------------------------------------------------- */

  handlePresence(stanza: Stanza): BuddyPresence | null {
    const keys = stanza.keys;
    const rawUserId = readFirst(keys, [
      'presence.from',
      'presence.amaz-from',
      'presence.jid',
      'iq/vcard/username',
    ]);
    if (!rawUserId) return null;

    const userId = rawUserId.split('/')[0] ?? rawUserId;
    const show = readFirst(keys, [
      'presence.show',
      'presence/state',
      'presence.state',
      'iq/vcard/show',
      'iq/vcard/status',
      'presence.type',
    ]);
    const statusMessage = readFirst(keys, [
      'presence.status',
      'presence/status',
      'presence.status-message',
      'iq/vcard/status-message',
    ]);
    const lastSeenRaw = readFirst(keys, ['presence.last-seen', 'presence.ts', 'presence.lastSeen']);
    const lastSeen = Number(lastSeenRaw);

    const presence: BuddyPresence = {
      status: fromWireShow(show),
      statusMessage: statusMessage || undefined,
      lastSeen: Number.isFinite(lastSeen) && lastSeen > 0 ? lastSeen : undefined,
      updatedAt: Date.now(),
    };

    useUzzapStore.getState().setPresence(userId, presence);
    return presence;
  }

  getPresence(buddyId: string): BuddyPresence | undefined {
    return useUzzapStore.getState().presence[buddyId];
  }

  getSelfStatus(): PresenceStatus {
    return useUzzapStore.getState().selfStatus;
  }

  setTyping(buddyId: string, isTyping: boolean): void {
    useUzzapStore.getState().setTyping(buddyId, isTyping);
  }
}

export const presenceService = new PresenceService();

export const publishStatus = (status: PresenceStatus, statusMessage?: string): Promise<void> =>
  presenceService.publishStatus(status, statusMessage);
export const publishOnline = (statusMessage?: string): Promise<void> =>
  presenceService.publishOnline(statusMessage);
export const publishBusy = (statusMessage?: string): Promise<void> =>
  presenceService.publishBusy(statusMessage);
export const setIdle = (isIdle: boolean): Promise<void> => presenceService.setIdle(isIdle);
