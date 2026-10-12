import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { db } from '../db/client';
import { buddies as buddiesTable } from '../db/schema';
import { conversations as conversationsTable } from '../db/schema';
import { messages as messagesTable } from '../db/schema';
import type { ConversationRow, MessageRow } from '../db/schema';
import { useUzzapStore } from '../store';
import type { Conversation, Message, MessageType } from '../types/models';
import type { MessageProtocol } from '../types/protocol';
import { offlineQueue } from './offlineQueue';
import { pushService } from './pushService';
import { supabase } from './supabaseClient';

/**
 * Message send/receive orchestration on Supabase.
 *
 * Outbound messages are echoed locally (status `sending`), inserted into the
 * `messages` table (insert success = server ACK → `sent`), and mirrored to
 * SQLite. When offline they are written to the SQLite-backed `offlineQueue`
 * and flushed on the next successful session check. Inbound messages arrive
 * over a Realtime channel on `messages` INSERTs.
 *
 * Public API is unchanged from the legacy transport version.
 */

export interface SendMessageInput {
  recipientId: string;
  content: string;
  conversationId?: string;
  id?: string;
  protocol?: MessageProtocol;
  type?: MessageType;
  location?: string;
  meta?: Record<string, unknown>;
  /** Force the offline queue even when online. */
  offline?: boolean;
}

export interface SendMediaInput {
  recipientId: string;
  type: 'image' | 'voice' | 'location' | 'file';
  uri: string;
  conversationId?: string;
  mimeType?: string;
  fileName?: string;
  duration?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

interface ServerMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: string;
  content: string;
  timestamp: number;
  status: string;
  receipt_requested: boolean;
  offline_queued: boolean;
  amaz_msg_id: string | null;
  retry_count: number;
  meta: Record<string, unknown> | null;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    recipientId: row.conversationId,
    type: row.type,
    protocol: 'im',
    content: row.content,
    timestamp: row.timestamp,
    status: row.status,
    receiptRequested: row.receiptRequested,
    offlineQueued: row.offlineQueued,
    isRead: row.status === 'read',
    amazMsgId: row.amazMsgId ?? undefined,
    retryCount: row.retryCount,
  };
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    buddyId: row.buddyId,
    lastMessageId: row.lastMessageId ?? undefined,
    unreadCount: row.unreadCount,
    isPinned: row.isPinned,
    draftText: row.draftText ?? undefined,
    updatedAt: row.updatedAt,
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

async function hasSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  } catch {
    return false;
  }
}

export class MessageService {
  /** Local conversation id (buddy userId) → server conversation uuid. */
  private readonly serverConversationIds = new Map<string, string>();
  private messagesChannel: RealtimeChannel | null = null;

  /* ---------------------------------------------------------------------- */
  /* Realtime                                                               */
  /* ---------------------------------------------------------------------- */

  /** Live inbound messages for the signed-in owner. Idempotent. */
  subscribeMessages(): () => void {
    if (this.messagesChannel) return () => undefined;
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          void this.handleRemoteMessage(payload.new as unknown as ServerMessageRow);
        },
      )
      .subscribe();
    this.messagesChannel = channel;
    return () => {
      void supabase.removeChannel(channel);
      if (this.messagesChannel === channel) this.messagesChannel = null;
    };
  }

  unsubscribeMessages(): void {
    if (!this.messagesChannel) return;
    const channel = this.messagesChannel;
    this.messagesChannel = null;
    void supabase.removeChannel(channel);
  }

  /* ---------------------------------------------------------------------- */
  /* Sending                                                                */
  /* ---------------------------------------------------------------------- */

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const now = Math.floor(Date.now() / 1000);
    const selfId = useUzzapStore.getState().user?.id ?? 'self';
    const id = input.id ?? uuidv4();
    const conversationId = input.conversationId ?? input.recipientId;

    await this.ensureConversation(conversationId, input.recipientId, now);

    const online = (await hasSession()) && input.offline !== true;
    const message: Message = {
      id,
      conversationId,
      senderId: selfId,
      recipientId: input.recipientId,
      type: input.type ?? 'text',
      protocol: input.protocol ?? 'im',
      content: input.content,
      timestamp: now,
      status: online ? 'sending' : 'pending',
      receiptRequested: true,
      offlineQueued: !online,
      isRead: true,
      retryCount: 0,
      meta: input.meta,
    };

    const store = useUzzapStore.getState();
    store.appendMessage(message);
    await this.persistMessage(message);

    if (!online) {
      await offlineQueue.enqueue({
        id,
        to: input.recipientId,
        body: input.content,
        protocol: message.protocol,
        meta: input.meta,
      });
      return message;
    }

    await this.dispatchMessage(message);
    return message;
  }

  private async dispatchMessage(message: Message): Promise<void> {
    try {
      await this.insertRemote(message);
      useUzzapStore.getState().updateMessageStatus(message.conversationId, message.id, 'sent');
      void this.updateStatus(message.id, 'sent');
    } catch (error) {
      void this.markFailed(message, error instanceof Error ? error.message : 'send-error');
    }
  }

  async sendMedia(input: SendMediaInput): Promise<Message> {
    const now = Math.floor(Date.now() / 1000);
    const selfId = useUzzapStore.getState().user?.id ?? 'self';
    const id = uuidv4();
    const conversationId = input.conversationId ?? input.recipientId;

    await this.ensureConversation(conversationId, input.recipientId, now);

    const meta: Record<string, unknown> = {
      mediaType: input.type,
      uri: input.uri,
      mimeType: input.mimeType,
      fileName: input.fileName,
    };

    if (input.duration) meta.duration = input.duration;
    if (input.latitude !== undefined) meta.latitude = input.latitude;
    if (input.longitude !== undefined) meta.longitude = input.longitude;
    if (input.locationName) meta.locationName = input.locationName;

    const online = await hasSession();
    const message: Message = {
      id,
      conversationId,
      senderId: selfId,
      recipientId: input.recipientId,
      type: input.type,
      protocol: 'im',
      content: input.uri,
      timestamp: now,
      status: online ? 'sending' : 'pending',
      receiptRequested: true,
      offlineQueued: !online,
      isRead: true,
      retryCount: 0,
      meta,
    };

    const store = useUzzapStore.getState();
    store.appendMessage(message);
    await this.persistMessage(message);

    if (!online) {
      await offlineQueue.enqueue({
        id,
        to: input.recipientId,
        body: input.uri,
        protocol: message.protocol,
        meta,
      });
      return message;
    }

    // Upload to the shared bucket so other devices can fetch it, then point
    // the message body at the public URL (falls back to the local uri).
    const publicUrl = await this.uploadMedia(input.uri, input.fileName, input.mimeType).catch(
      () => null,
    );
    if (publicUrl) {
      message.content = publicUrl;
      (message.meta as Record<string, unknown>).uri = publicUrl;
      await this.persistMessage(message);
      store.upsertMessage(message);
    }
    await this.dispatchMessage(message);
    return message;
  }

  /** Upload a local file to the `chat-media` bucket; returns the public URL. */
  async uploadMedia(uri: string, fileName?: string, mimeType?: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const safeName = (fileName ?? `media-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from('chat-media')
        .upload(path, blob, { contentType: mimeType ?? blob.type ?? 'application/octet-stream' });
      if (error) return null;
      const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
      return data.publicUrl || null;
    } catch {
      return null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Receiving                                                              */
  /* ---------------------------------------------------------------------- */

  async handleRemoteMessage(row: ServerMessageRow): Promise<Message | null> {
    const now = Math.floor(Date.now() / 1000);
    const selfId = useUzzapStore.getState().user?.id ?? '';
    const localConversationId = await this.localConversationFor(row.conversation_id);
    if (!localConversationId) return null;

    const store = useUzzapStore.getState();
    const alreadySeen = (store.messagesByConversation[localConversationId] ?? []).some(
      (message) => message.id === row.id,
    );
    if (alreadySeen) return null;
    // Ignore our own echo (we already appended it optimistically).
    if (row.sender_id === selfId) return null;

    await this.ensureConversationByBuddy(localConversationId, now);

    const message: Message = {
      id: row.id,
      conversationId: localConversationId,
      senderId: row.sender_id,
      recipientId: selfId,
      type: (row.type as Message['type']) ?? 'text',
      protocol: 'im',
      content: row.content,
      timestamp: row.timestamp || now,
      status: 'delivered',
      receiptRequested: false,
      offlineQueued: false,
      isRead: false,
      amazMsgId: row.amaz_msg_id ?? undefined,
      retryCount: row.retry_count ?? 0,
      meta: (row.meta as Record<string, unknown> | undefined) ?? undefined,
    };

    useUzzapStore.getState().appendMessage(message);
    await this.persistMessage(message);

    const activeConversationId = useUzzapStore.getState().activeConversationId;
    if (activeConversationId !== localConversationId) {
      const buddy = useUzzapStore.getState().buddies[localConversationId];
      const displayName = buddy?.displayName ?? row.sender_id;
      void pushService.scheduleLocalNotification(displayName, row.content, {
        conversationId: localConversationId,
        messageId: row.id,
        type: 'message',
      });
    }

    return message;
  }

  /* ---------------------------------------------------------------------- */
  /* Delete / forward                                                       */
  /* ---------------------------------------------------------------------- */

  /** Delete a message locally (store + SQLite + offline queue + server). */
  async deleteMessage(conversationId: string, messageId: string): Promise<boolean> {
    const store = useUzzapStore.getState();
    const history = store.messagesByConversation[conversationId] ?? [];
    if (!history.some((m) => m.id === messageId)) return false;
    store.removeMessage(conversationId, messageId);
    await db.delete(messagesTable).where(eq(messagesTable.id, messageId)).run();
    await offlineQueue.remove(messageId);
    try {
      await supabase.from('messages').delete().eq('id', messageId);
    } catch {
      // Local delete already applied; server cleanup is best-effort.
    }
    return true;
  }

  /** Forward a message's content to another conversation. */
  async forwardMessage(
    messageId: string,
    targetRecipientId: string,
    targetConversationId?: string,
  ): Promise<Message | null> {
    const store = useUzzapStore.getState();
    let source: Message | undefined;
    for (const list of Object.values(store.messagesByConversation)) {
      source = list.find((m) => m.id === messageId);
      if (source) break;
    }
    if (!source) return null;
    const { replyTo: _replyTo, ...restMeta } = source.meta ?? {};
    return this.sendMessage({
      recipientId: targetRecipientId,
      conversationId: targetConversationId ?? targetRecipientId,
      content: source.content,
      type: source.type,
      protocol: source.protocol,
      meta: { ...restMeta, forwardedFrom: source.senderId },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Offline queue / retry                                                  */
  /* ---------------------------------------------------------------------- */

  async flushOfflineQueue(): Promise<number> {
    if (!(await hasSession())) return 0;
    const items = await offlineQueue.dequeue(50);
    let sent = 0;

    for (const item of items) {
      try {
        const store = useUzzapStore.getState();
        let target: Message | undefined;
        let targetConversation: string | undefined;
        for (const [conversationId, list] of Object.entries(store.messagesByConversation)) {
          const found = list.find((m) => m.id === item.id);
          if (found) {
            target = found;
            targetConversation = conversationId;
            break;
          }
        }
        if (!target || !targetConversation) {
          await offlineQueue.markSent(item.id);
          continue;
        }
        target.status = 'sending';
        await this.insertRemote(target);
        store.updateMessageStatus(targetConversation, item.id, 'sent');
        await this.updateStatus(item.id, 'sent');
        await offlineQueue.markSent(item.id);
        sent += 1;
      } catch (error) {
        await offlineQueue.markRetry(
          item.id,
          error instanceof Error ? error.message : 'send-error',
          30_000,
        );
      }
    }
    return sent;
  }

  async retryMessage(messageId: string): Promise<boolean> {
    const store = useUzzapStore.getState();
    for (const [conversationId, list] of Object.entries(store.messagesByConversation)) {
      const message = list.find((candidate) => candidate.id === messageId);
      if (!message) continue;

      if (await hasSession()) {
        store.updateMessageStatus(conversationId, messageId, 'sending');
        await this.dispatchMessage(message);
        return true;
      }

      await offlineQueue.enqueue({
        id: message.id,
        to: message.recipientId,
        body: message.content,
        protocol: message.protocol,
        meta: message.meta,
      });
      store.updateMessageStatus(conversationId, messageId, 'pending');
      return true;
    }
    return false;
  }

  markConversationRead(conversationId: string): void {
    // The legacy protocol has no read-receipt stanza; receipts are local.
    useUzzapStore.getState().markConversationRead(conversationId);
  }

  async loadConversation(conversationId: string): Promise<Message[]> {
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .all();
    const list = rows.map(rowToMessage).sort((a, b) => a.timestamp - b.timestamp);
    const store = useUzzapStore.getState();
    for (const message of list) store.upsertMessage(message);
    return list;
  }

  /**
   * Restore the SQLite conversation + message caches into the store. Called
   * after authentication so the UI reflects on-device history before the
   * network round-trips complete.
   */
  async hydrateFromDatabase(): Promise<{ conversations: Conversation[]; messages: Message[] }> {
    const conversationRows = await db.select().from(conversationsTable).all();
    const conversations = conversationRows.map(rowToConversation);

    const store = useUzzapStore.getState();
    store.setConversations(conversations);

    const messageRows = await db.select().from(messagesTable).all();
    const messages = messageRows.map(rowToMessage).sort((a, b) => a.timestamp - b.timestamp);
    for (const message of messages) store.upsertMessage(message);

    return { conversations, messages };
  }

  /**
   * Pull the server-side conversations + recent messages into the store and
   * refresh the local SQLite mirror.
   */
  async syncFromServer(limitPerConversation = 50): Promise<void> {
    const owner = await ownerId();
    if (!owner) return;
    const store = useUzzapStore.getState();

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, buddy_id, last_message_id, unread_count, is_pinned, draft_text, updated_at')
      .eq('owner_id', owner);
    if (error || !conversations) return;

    for (const row of conversations) {
      const localId = row.buddy_id as string;
      this.serverConversationIds.set(localId, row.id as string);
      store.upsertConversation({
        id: localId,
        buddyId: localId,
        lastMessageId: (row.last_message_id as string | null) ?? undefined,
        unreadCount: (row.unread_count as number) ?? 0,
        isPinned: (row.is_pinned as boolean) ?? false,
        draftText: (row.draft_text as string | null) ?? undefined,
        updatedAt: (row.updated_at as number) ?? Math.floor(Date.now() / 1000),
      });

      const { data: messages } = await supabase
        .from('messages')
        .select(
          'id, conversation_id, sender_id, type, content, timestamp, status, receipt_requested, offline_queued, amaz_msg_id, retry_count, meta',
        )
        .eq('conversation_id', row.id)
        .order('timestamp', { ascending: true })
        .limit(limitPerConversation);
      for (const m of messages ?? []) {
        const r = m as unknown as ServerMessageRow;
        const message: Message = {
          id: r.id,
          conversationId: localId,
          senderId: r.sender_id,
          recipientId: localId,
          type: (r.type as Message['type']) ?? 'text',
          protocol: 'im',
          content: r.content,
          timestamp: r.timestamp,
          status: (r.status as Message['status']) ?? 'sent',
          receiptRequested: r.receipt_requested ?? false,
          offlineQueued: false,
          isRead: r.status === 'read',
          amazMsgId: r.amaz_msg_id ?? undefined,
          retryCount: r.retry_count ?? 0,
          meta: (r.meta as Record<string, unknown> | undefined) ?? undefined,
        };
        store.upsertMessage(message);
        await this.persistMessage(message);
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private async ensureConversation(
    conversationId: string,
    buddyId: string,
    now: number,
  ): Promise<void> {
    const store = useUzzapStore.getState();

    if (!store.buddies[buddyId]) {
      store.upsertBuddy({
        userId: buddyId,
        displayName: buddyId,
        status: 'offline',
        isBlocked: false,
        isUzzapUser: true,
        groups: [],
      });
      await db
        .insert(buddiesTable)
        .values({
          userId: buddyId,
          displayName: buddyId,
          status: 'offline',
          isBlocked: false,
          isUzzapUser: true,
          groups: [],
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
    }

    if (!store.conversations[conversationId]) {
      store.upsertConversation({
        id: conversationId,
        buddyId,
        unreadCount: 0,
        isPinned: false,
        updatedAt: now,
      });
      await db
        .insert(conversationsTable)
        .values({ id: conversationId, buddyId, unreadCount: 0, isPinned: false, updatedAt: now })
        .onConflictDoNothing()
        .run();
    }

    // Mirror the conversation server-side (best effort; RLS-scoped).
    try {
      const owner = await ownerId();
      if (owner && !this.serverConversationIds.has(conversationId)) {
        const { data } = await supabase
          .from('conversations')
          .upsert(
            { owner_id: owner, buddy_id: buddyId, updated_at: now },
            { onConflict: 'owner_id,buddy_id' },
          )
          .select('id')
          .maybeSingle();
        const serverId = (data as { id?: string } | null)?.id;
        if (serverId) this.serverConversationIds.set(conversationId, serverId);
      }
    } catch {
      // Offline or RLS-blocked — the message insert will retry via the queue.
    }
  }

  private async ensureConversationByBuddy(buddyId: string, now: number): Promise<void> {
    await this.ensureConversation(buddyId, buddyId, now);
  }

  /** Map a server conversation uuid back to the local conversation id. */
  private async localConversationFor(serverConversationId: string): Promise<string | null> {
    for (const [localId, serverId] of this.serverConversationIds) {
      if (serverId === serverConversationId) return localId;
    }
    try {
      const owner = await ownerId();
      if (!owner) return null;
      const { data } = await supabase
        .from('conversations')
        .select('id, buddy_id')
        .eq('id', serverConversationId)
        .eq('owner_id', owner)
        .maybeSingle();
      if (!data) return null;
      const localId = (data as { buddy_id: string }).buddy_id;
      this.serverConversationIds.set(localId, serverConversationId);
      return localId;
    } catch {
      return null;
    }
  }

  /** Insert (or upsert) a message row server-side. Insert = acknowledged. */
  private async insertRemote(message: Message): Promise<void> {
    const owner = await ownerId();
    if (!owner) throw new Error('No session');
    let serverConversationId = this.serverConversationIds.get(message.conversationId);
    if (!serverConversationId) {
      await this.ensureConversation(
        message.conversationId,
        message.recipientId,
        Math.floor(Date.now() / 1000),
      );
      serverConversationId = this.serverConversationIds.get(message.conversationId) ?? undefined;
    }
    if (!serverConversationId) throw new Error('No remote conversation');
    const { error } = await supabase.from('messages').upsert(
      {
        id: message.id,
        conversation_id: serverConversationId,
        sender_id: message.senderId,
        type: message.type,
        content: message.content,
        timestamp: message.timestamp,
        status: 'sent',
        receipt_requested: message.receiptRequested,
        offline_queued: false,
        amaz_msg_id: message.amazMsgId ?? null,
        retry_count: message.retryCount,
        meta: (message.meta ?? {}) as Record<string, unknown>,
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
    try {
      await supabase
        .from('conversations')
        .update({ last_message_id: message.id, updated_at: message.timestamp })
        .eq('id', serverConversationId);
    } catch {
      // Non-fatal bookkeeping.
    }
  }

  private async persistMessage(message: Message): Promise<void> {
    const values = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      type: message.type,
      content: message.content,
      timestamp: message.timestamp,
      status: message.status,
      receiptRequested: message.receiptRequested,
      offlineQueued: message.offlineQueued,
      amazMsgId: message.amazMsgId ?? null,
      retryCount: message.retryCount,
    };
    await db
      .insert(messagesTable)
      .values(values)
      .onConflictDoUpdate({
        target: messagesTable.id,
        set: {
          status: values.status,
          offlineQueued: values.offlineQueued,
          amazMsgId: values.amazMsgId,
          retryCount: values.retryCount,
        },
      })
      .run();
  }

  private async updateStatus(messageId: string, status: Message['status']): Promise<void> {
    await db.update(messagesTable).set({ status }).where(eq(messagesTable.id, messageId)).run();
  }

  private async markFailed(message: Message, reason: string): Promise<void> {
    useUzzapStore.getState().updateMessageStatus(message.conversationId, message.id, 'failed');
    await this.updateStatus(message.id, 'failed');
    // Keep the payload so it can be retried manually or on reconnect.
    await offlineQueue.enqueue({
      id: message.id,
      to: message.recipientId,
      body: message.content,
      protocol: message.protocol,
      meta: { ...(message.meta ?? {}), error: reason },
    });
  }

}

export const messageService = new MessageService();

export const sendMessage = (input: SendMessageInput): Promise<Message> =>
  messageService.sendMessage(input);
export const sendMedia = (input: SendMediaInput): Promise<Message> =>
  messageService.sendMedia(input);
export const flushOfflineQueue = (): Promise<number> => messageService.flushOfflineQueue();
export const retryMessage = (messageId: string): Promise<boolean> =>
  messageService.retryMessage(messageId);
export const deleteMessage = (conversationId: string, messageId: string): Promise<boolean> =>
  messageService.deleteMessage(conversationId, messageId);
export const forwardMessage = (
  messageId: string,
  targetRecipientId: string,
  targetConversationId?: string,
): Promise<Message | null> =>
  messageService.forwardMessage(messageId, targetRecipientId, targetConversationId);
