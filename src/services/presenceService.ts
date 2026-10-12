import type { RealtimeChannel } from '@supabase/supabase-js';

import { HOT_KEYS, hotKV } from '../storage/mmkv';
import { useUzzapStore } from '../store';
import type { BuddyPresence } from '../store/slices/presenceSlice';
import type { PresenceStatus } from '../types/protocol';
import { supabase } from './supabaseClient';

/**
 * Presence publish / subscribe on Supabase.
 *
 * The legacy server negotiated status through the `registry` target; here
 * presence is published by writing our own `profiles` row (status,
 * status_message, last_seen) and tracked live on a Realtime Presence channel.
 * Buddy presence arrives via `profiles` row changes plus the shared presence
 * channel. Typing state rides the same presence channel payload.
 *
 * Public API is unchanged so screens keep working without modification.
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

async function selfIdentity(): Promise<{ uid: string; username: string } | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return null;
    const username = useUzzapStore.getState().user?.id ?? data.user?.email ?? uid;
    return { uid, username };
  } catch {
    return null;
  }
}

export class PresenceService {
  private readonly subscriptions = new Set<string>();
  private presenceChannel: RealtimeChannel | null = null;
  private profilesChannel: RealtimeChannel | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

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

    const self = await selfIdentity();
    if (!self) return;

    try {
      await supabase
        .from('profiles')
        .update({
          status: toWireShow(status),
          status_message: statusMessage ?? null,
          last_seen: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        })
        .eq('id', self.uid);
    } catch {
      // Offline — local state already updated; reconciles on reconnect.
    }

    try {
      await this.presenceChannel?.track({
        username: self.username,
        status: toWireShow(status),
        typing: false,
        online_at: new Date().toISOString(),
      });
    } catch {
      // Channel not joined yet — profiles row carries the state.
    }
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

  /** Map the legacy idle signal onto away/available. */
  async setIdle(isIdle: boolean): Promise<void> {
    const store = useUzzapStore.getState();
    if (isIdle) {
      await this.publishStatus('away', store.selfStatusMessage ?? undefined);
    } else {
      await this.publishStatus(store.selfStatus === 'away' ? 'available' : store.selfStatus);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Subscriptions                                                          */
  /* ---------------------------------------------------------------------- */

  async subscribe(buddyId?: string): Promise<void> {
    if (buddyId) this.subscriptions.add(buddyId);
    await this.ensureChannels();
  }

  async unsubscribe(buddyId?: string): Promise<void> {
    if (buddyId) this.subscriptions.delete(buddyId);
    if (!buddyId || this.subscriptions.size === 0) {
      await this.teardownChannels();
    }
  }

  getSubscriptions(): string[] {
    return [...this.subscriptions];
  }

  private async ensureChannels(): Promise<void> {
    if (!this.presenceChannel) {
      const self = await selfIdentity();
      const channel = supabase.channel('presence', {
        config: { presence: { key: self?.username ?? 'anonymous' } },
      });
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<{
            username: string;
            status: string;
            typing: boolean;
          }>();
          this.applyPresenceState(state);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && self) {
            try {
              await channel.track({
                username: self.username,
                status: toWireShow(useUzzapStore.getState().selfStatus),
                typing: false,
                online_at: new Date().toISOString(),
              });
            } catch {
              // Presence is best-effort.
            }
          }
        });
      this.presenceChannel = channel;
    }

    if (!this.profilesChannel) {
      const channel = supabase
        .channel('profiles-presence')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles' },
          (payload) => {
            const row = payload.new as {
              username?: string;
              status?: string;
              status_message?: string | null;
              last_seen?: number | null;
            };
            if (!row.username) return;
            const presence: BuddyPresence = {
              status: fromWireShow(row.status ?? 'offline'),
              statusMessage: row.status_message || undefined,
              lastSeen:
                typeof row.last_seen === 'number' && row.last_seen > 0
                  ? row.last_seen
                  : undefined,
              updatedAt: Date.now(),
            };
            useUzzapStore.getState().setPresence(row.username, presence);
          },
        )
        .subscribe();
      this.profilesChannel = channel;
    }
  }

  private async teardownChannels(): Promise<void> {
    const channels = [this.presenceChannel, this.profilesChannel];
    this.presenceChannel = null;
    this.profilesChannel = null;
    for (const channel of channels) {
      if (channel) {
        try {
          await supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    }
  }

  private applyPresenceState(
    state: Record<string, { username: string; status: string; typing: boolean }[]>,
  ): void {
    const store = useUzzapStore.getState();
    const selfUsername = store.user?.id;
    const seen = new Set<string>();
    for (const metas of Object.values(state)) {
      for (const meta of metas) {
        if (!meta.username || meta.username === selfUsername) continue;
        seen.add(meta.username);
        store.setPresence(meta.username, {
          ...(store.presence[meta.username] ?? {}),
          status: fromWireShow(meta.status ?? 'available'),
          updatedAt: Date.now(),
        } as BuddyPresence);
        store.setTyping(meta.username, Boolean(meta.typing));
      }
    }
    // Anyone previously seen as online who vanished from presence state
    // goes offline (they closed the app without unsubscribing).
    for (const userId of Object.keys(store.presence)) {
      if (!seen.has(userId) && store.presence[userId]?.status !== 'offline') {
        store.setPresence(userId, { status: 'offline', updatedAt: Date.now() });
        store.setTyping(userId, false);
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Inbound                                                                */
  /* ---------------------------------------------------------------------- */

  getPresence(buddyId: string): BuddyPresence | undefined {
    return useUzzapStore.getState().presence[buddyId];
  }

  getSelfStatus(): PresenceStatus {
    return useUzzapStore.getState().selfStatus;
  }

  setTyping(buddyId: string, isTyping: boolean): void {
    useUzzapStore.getState().setTyping(buddyId, isTyping);
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    if (!isTyping) {
      void this.trackTyping(false);
      return;
    }
    void this.trackTyping(true);
    // Auto-clear a stuck typing flag after 10 s without renewal.
    this.typingTimer = setTimeout(() => {
      useUzzapStore.getState().setTyping(buddyId, false);
      void this.trackTyping(false);
    }, 10_000);
  }

  /** Publish our own typing flag (normally driven by the chat composer). */
  async publishTyping(isTyping: boolean): Promise<void> {
    await this.trackTyping(isTyping);
  }

  private async trackTyping(isTyping: boolean): Promise<void> {
    const self = await selfIdentity();
    if (!self || !this.presenceChannel) return;
    try {
      await this.presenceChannel.track({
        username: self.username,
        status: toWireShow(useUzzapStore.getState().selfStatus),
        typing: isTyping,
        online_at: new Date().toISOString(),
      });
    } catch {
      // best effort
    }
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
