import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../db/client';
import { buddies as buddiesTable } from '../db/schema';
import { conversations as conversationsTable } from '../db/schema';
import { messages as messagesTable } from '../db/schema';
import type { ConversationRow, MessageRow } from '../db/schema';
import { useUzzapStore } from '../store';
import type { Conversation, Message, MessageType } from '../types/models';
import type { InboundWireMessage, MessageProtocol } from '../types/protocol';
import { offlineQueue } from './offlineQueue';
import type { PendingMessage } from './wsClient';
import { wsClient } from './wsClient';
import { pushService } from './pushService';

/**
 * Message send/receive orchestration.
 *
 * Outbound messages are echoed locally (status `sending`), handed to the
 * engine which owns ACK/retry (300 s / 3 attempts, spec §10.2), and persisted
 * to SQLite. When the socket is offline they are written to the SQLite-backed
 * `offlineQueue` and flushed on reconnect.
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

function mapWireProtocolToType(protocol: MessageProtocol): MessageType {
  if (protocol === 'sms' || protocol === 'smsr') return 'sms';
  return 'text';
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

export class MessageService {
  constructor() {
    wsClient.addListener((event) => {
      switch (event.type) {
        case 'message':
          void this.handleInbound(event.message);
          break;
        case 'ack':
          void this.handleAck(event.messageId);
          break;
        case 'message-failed':
          void this.handleFailed(event.pending);
          break;
        case 'state':
          if (event.state === 'online') void this.flushOfflineQueue();
          break;
        default:
          break;
      }
    });
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

    const online = wsClient.isOnline() && input.offline !== true;
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

    this.dispatchMessage(message, input.location);
    return message;
  }

  private dispatchMessage(message: Message, location?: string): void {
    try {
      wsClient.sendMessage({
        to: message.recipientId,
        body: message.content,
        msgId: message.id,
        protocol: message.protocol,
        location,
      });
      useUzzapStore.getState().updateMessageStatus(message.conversationId, message.id, 'sending');
      void this.updateStatus(message.id, 'sending');
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

    const online = wsClient.isOnline();
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

    this.dispatchMessage(message);
    return message;
  }

  /* ---------------------------------------------------------------------- */
  /* Receiving                                                              */
  /* ---------------------------------------------------------------------- */

  async handleInbound(wire: InboundWireMessage): Promise<Message | null> {
    const now = Math.floor(Date.now() / 1000);
    const selfId = useUzzapStore.getState().user?.id ?? '';
    const conversationId = wire.from;
    const id = wire.msgId || uuidv4();

    const store = useUzzapStore.getState();
    const alreadySeen = (store.messagesByConversation[conversationId] ?? []).some(
      (message) => message.id === id || (wire.msgId !== '' && message.amazMsgId === wire.msgId),
    );
    if (alreadySeen) return null;

    await this.ensureConversation(conversationId, wire.from, now);

    const message: Message = {
      id,
      conversationId,
      senderId: wire.from,
      recipientId: selfId,
      type: mapWireProtocolToType(wire.protocol),
      protocol: wire.protocol,
      content: wire.body,
      timestamp: wire.timestamp || now,
      status: 'delivered',
      receiptRequested: false,
      offlineQueued: false,
      isRead: false,
      amazMsgId: wire.msgId || undefined,
      retryCount: wire.retries,
      meta: {
        displayName: wire.displayName,
        location: wire.location,
        isBuddyInvite: wire.isBuddyInvite,
        isAbmFrom: wire.isAbmFrom,
        contacts: wire.contacts,
      },
    };

    useUzzapStore.getState().appendMessage(message);
    await this.persistMessage(message);

    // Schedule local push notification if conversation is not active
    const activeConversationId = useUzzapStore.getState().activeConversationId;
    if (activeConversationId !== conversationId) {
      const buddy = useUzzapStore.getState().buddies[wire.from];
      const displayName = buddy?.displayName ?? wire.displayName ?? wire.from;
      void pushService.scheduleLocalNotification(displayName, wire.body, {
        conversationId,
        messageId: id,
        type: 'message',
      });
    }

    return message;
  }

  /* ---------------------------------------------------------------------- */
  /* ACK / failure                                                          */
  /* ---------------------------------------------------------------------- */

  async handleAck(messageId: string): Promise<void> {
    const store = useUzzapStore.getState();
    for (const [conversationId, list] of Object.entries(store.messagesByConversation)) {
      const message = list.find((candidate) => candidate.id === messageId);
      if (!message) continue;
      store.updateMessageStatus(conversationId, messageId, 'sent', Math.floor(Date.now() / 1000));
      break;
    }
    await offlineQueue.remove(messageId);
    await this.updateStatus(messageId, 'sent');
  }

  async handleFailed(pending: PendingMessage): Promise<void> {
    const store = useUzzapStore.getState();
    for (const [conversationId, list] of Object.entries(store.messagesByConversation)) {
      const message = list.find((candidate) => candidate.id === pending.msgId);
      if (!message) continue;
      store.updateMessageStatus(conversationId, pending.msgId, 'failed');
      break;
    }
    await db
      .update(messagesTable)
      .set({ status: 'failed', retryCount: pending.tries })
      .where(eq(messagesTable.id, pending.msgId))
      .run();
  }

  /* ---------------------------------------------------------------------- */
  /* Offline queue / retry                                                  */
  /* ---------------------------------------------------------------------- */

  async flushOfflineQueue(): Promise<number> {
    if (!wsClient.isOnline()) return 0;
    const items = await offlineQueue.dequeue(50);
    let sent = 0;

    for (const item of items) {
      const location =
        typeof item.meta?.location === 'string' ? (item.meta.location as string) : undefined;
      try {
        wsClient.sendMessage({
          to: item.to,
          body: item.body,
          msgId: item.id,
          protocol: item.protocol as MessageProtocol,
          location,
        });
        await offlineQueue.markSent(item.id);
        this.setStatusById(item.id, 'sending');
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

      if (wsClient.isOnline()) {
        store.updateMessageStatus(conversationId, messageId, 'sending');
        this.dispatchMessage(message);
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

  private setStatusById(messageId: string, status: Message['status']): void {
    const store = useUzzapStore.getState();
    for (const [conversationId, list] of Object.entries(store.messagesByConversation)) {
      if (!list.some((candidate) => candidate.id === messageId)) continue;
      store.updateMessageStatus(conversationId, messageId, status);
      break;
    }
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
