import type { Conversation, Message, MessageStatus } from '../../types/models';
import type { UzzapSlice } from '../index';

export interface MessagesSlice {
  /** Conversations keyed by conversation id. */
  conversations: Record<string, Conversation>;
  /** Message history keyed by conversation id (chronological). */
  messagesByConversation: Record<string, Message[]>;
  /** Currently open conversation id, if any. */
  activeConversationId: string | null;

  upsertConversation: (conversation: Conversation) => void;
  setConversations: (conversations: Conversation[]) => void;
  removeConversation: (conversationId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;

  appendMessage: (message: Message) => void;
  upsertMessage: (message: Message) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  updateMessageStatus: (
    conversationId: string,
    messageId: string,
    status: MessageStatus,
    at?: number,
  ) => void;
  setMessageRead: (conversationId: string, messageId: string) => void;

  markConversationRead: (conversationId: string) => void;
  setUnreadCount: (conversationId: string, count: number) => void;
  setDraft: (conversationId: string, draftText: string) => void;
  togglePinned: (conversationId: string) => void;
  clearConversation: (conversationId: string) => void;

  /** Sum of unread counts across every conversation. */
  totalUnread: () => number;
}

export const createMessagesSlice: UzzapSlice<MessagesSlice> = (set, get) => ({
  conversations: {},
  messagesByConversation: {},
  activeConversationId: null,

  upsertConversation: (conversation) =>
    set((state) => {
      state.conversations[conversation.id] = conversation;
    }),

  setConversations: (list) =>
    set((state) => {
      for (const conversation of list) {
        state.conversations[conversation.id] = conversation;
      }
    }),

  removeConversation: (conversationId) =>
    set((state) => {
      delete state.conversations[conversationId];
      delete state.messagesByConversation[conversationId];
      if (state.activeConversationId === conversationId) {
        state.activeConversationId = null;
      }
    }),

  setActiveConversation: (activeConversationId) =>
    set((state) => {
      state.activeConversationId = activeConversationId;
    }),

  appendMessage: (message) =>
    set((state) => {
      const history = state.messagesByConversation[message.conversationId] ?? [];
      if (history.some((existing) => existing.id === message.id)) return;

      history.push(message);
      state.messagesByConversation[message.conversationId] = history;

      const conversation = state.conversations[message.conversationId];
      if (!conversation) return;

      conversation.lastMessageId = message.id;
      conversation.updatedAt = message.timestamp;

      const isInbound = message.senderId !== state.user?.id;
      if (isInbound && !message.isRead) {
        conversation.unreadCount += 1;
      }
    }),

  upsertMessage: (message) =>
    set((state) => {
      const history = state.messagesByConversation[message.conversationId] ?? [];
      const index = history.findIndex((existing) => existing.id === message.id);
      if (index >= 0) history[index] = message;
      else history.push(message);
      state.messagesByConversation[message.conversationId] = history;
    }),

  removeMessage: (conversationId, messageId) =>
    set((state) => {
      const history = state.messagesByConversation[conversationId];
      if (!history) return;
      state.messagesByConversation[conversationId] = history.filter(
        (existing) => existing.id !== messageId,
      );
    }),

  updateMessageStatus: (conversationId, messageId, status, at) =>
    set((state) => {
      const history = state.messagesByConversation[conversationId];
      if (!history) return;
      const message = history.find((existing) => existing.id === messageId);
      if (!message) return;

      message.status = status;
      if (status === 'sent') message.sentAt = at ?? message.sentAt;
      if (status === 'delivered') message.deliveredAt = at ?? message.deliveredAt;
      if (status === 'read') {
        message.readAt = at ?? message.readAt;
        message.isRead = true;
      }
    }),

  setMessageRead: (conversationId, messageId) =>
    set((state) => {
      const message = state.messagesByConversation[conversationId]?.find(
        (existing) => existing.id === messageId,
      );
      if (message) message.isRead = true;
    }),

  markConversationRead: (conversationId) =>
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (conversation) conversation.unreadCount = 0;
      const history = state.messagesByConversation[conversationId];
      if (history) {
        for (const message of history) message.isRead = true;
      }
    }),

  setUnreadCount: (conversationId, count) =>
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (conversation) conversation.unreadCount = Math.max(0, count);
    }),

  setDraft: (conversationId, draftText) =>
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (conversation) conversation.draftText = draftText;
    }),

  togglePinned: (conversationId) =>
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (conversation) conversation.isPinned = !conversation.isPinned;
    }),

  clearConversation: (conversationId) =>
    set((state) => {
      state.messagesByConversation[conversationId] = [];
      const conversation = state.conversations[conversationId];
      if (conversation) {
        conversation.lastMessageId = undefined;
        conversation.unreadCount = 0;
      }
    }),

  totalUnread: () =>
    Object.values(get().conversations).reduce(
      (sum, conversation) => sum + (conversation.unreadCount || 0),
      0,
    ),
});
