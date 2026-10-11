import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { MessageStatus, MessageType } from '../types/models';
import type { PresenceStatus, ChatRoomType, ChatMessageType } from '../types/protocol';

/**
 * Drizzle ORM schema — Expo SQLite (`uzzap.db`).
 *
 * Derived from `PROTOCOL_SPEC.md` and the app data model. All timestamps are
 * **Unix epoch seconds** (`integer`) to stay aligned with the legacy protocol
 * (message timestamps and the epoch prefix of `amaz-msg-id`).
 */

/* -------------------------------------------------------------------------- */
/* users — the local, signed-in account                                       */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable('users', {
  /** Local/remote userId (primary account identity). */
  id: text('id').primaryKey(),
  phoneNumber: text('phone_number'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email'),
  /** Hash only — the plaintext password is never persisted. */
  passwordHash: text('password_hash'),
  /** Local unlock PIN (already hashed by the caller). */
  pin: text('pin'),
  createdAt: integer('created_at').notNull(),
  lastLogin: integer('last_login'),
  isLoggedIn: integer('is_logged_in', { mode: 'boolean' }).notNull().default(false),
});

/* -------------------------------------------------------------------------- */
/* buddies — roster / contacts                                                */
/* -------------------------------------------------------------------------- */

export const buddies = sqliteTable(
  'buddies',
  {
    /** Uzzap user id (also the local primary key). */
    userId: text('user_id').primaryKey(),
    displayName: text('display_name').notNull(),
    phoneNumber: text('phone_number'),
    status: text('status').$type<PresenceStatus>().notNull().default('offline'),
    statusMessage: text('status_message'),
    isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false),
    isUzzapUser: integer('is_uzzap_user', { mode: 'boolean' }).notNull().default(true),
    lastSeen: integer('last_seen'),
    avatar: text('avatar'),
    /** JSON-encoded `string[]` of group names. */
    groups: text('groups', { mode: 'json' }).$type<string[]>().notNull().default([]),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    statusIdx: index('buddies_status_idx').on(table.status),
    displayNameIdx: index('buddies_display_name_idx').on(table.displayName),
  }),
);

/* -------------------------------------------------------------------------- */
/* conversations                                                              */
/* -------------------------------------------------------------------------- */

export const conversations = sqliteTable(
  'conversations',
  {
    /** Conversation id — equals the buddy userId for 1:1 threads. */
    id: text('id').primaryKey(),
    buddyId: text('buddy_id')
      .notNull()
      .references(() => buddies.userId, { onDelete: 'cascade' }),
    lastMessageId: text('last_message_id'),
    unreadCount: integer('unread_count').notNull().default(0),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    draftText: text('draft_text'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    buddyIdx: index('conversations_buddy_idx').on(table.buddyId),
    updatedIdx: index('conversations_updated_idx').on(table.updatedAt),
  }),
);

/* -------------------------------------------------------------------------- */
/* messages                                                                   */
/* -------------------------------------------------------------------------- */

export const messages = sqliteTable(
  'messages',
  {
    /** Locally-generated UUID. */
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id').notNull(),
    type: text('type').$type<MessageType>().notNull().default('text'),
    content: text('content').notNull(),
    /** Epoch seconds. */
    timestamp: integer('timestamp').notNull(),
    status: text('status').$type<MessageStatus>().notNull().default('pending'),
    receiptRequested: integer('receipt_requested', { mode: 'boolean' }).notNull().default(true),
    offlineQueued: integer('offline_queued', { mode: 'boolean' }).notNull().default(false),
    /** Server-assigned message id (`amaz-msg-id`). */
    amazMsgId: text('amaz_msg_id'),
    retryCount: integer('retry_count').notNull().default(0),
  },
  (table) => ({
    conversationIdx: index('messages_conversation_idx').on(table.conversationId, table.timestamp),
    statusIdx: index('messages_status_idx').on(table.status),
    amazMsgIdIdx: uniqueIndex('messages_amaz_msg_id_idx').on(table.amazMsgId),
  }),
);

/* -------------------------------------------------------------------------- */
/* chat rooms (spec §9)                                                       */
/* -------------------------------------------------------------------------- */

export const chatRooms = sqliteTable(
  'chat_rooms',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').$type<ChatRoomType>().notNull().default('generated'),
    maxUsers: integer('max_users').notNull().default(20),
    passwordProtected: integer('password_protected', { mode: 'boolean' }).notNull().default(false),
    creatorId: text('creator_id'),
    createdAt: integer('created_at').notNull(),
    lastActiveAt: integer('last_active_at'),
    isJoined: integer('is_joined', { mode: 'boolean' }).notNull().default(false),
    myNick: text('my_nick'),
  },
  (table) => ({
    nameIdx: index('chat_rooms_name_idx').on(table.name),
    typeIdx: index('chat_rooms_type_idx').on(table.type),
    joinedIdx: index('chat_rooms_joined_idx').on(table.isJoined),
  }),
);

export const chatRoomUsers = sqliteTable(
  'chat_room_users',
  {
    id: text('id').primaryKey(), // composite: roomId:userId
    roomId: text('room_id')
      .notNull()
      .references(() => chatRooms.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    nick: text('nick').notNull(),
    role: text('role', { enum: ['moderator', 'participant', 'visitor'] }).notNull().default('participant'),
    status: text('status').$type<PresenceStatus>().notNull().default('offline'),
    isSelf: integer('is_self', { mode: 'boolean' }).notNull().default(false),
    joinedAt: integer('joined_at').notNull(),
    lastSeen: integer('last_seen'),
  },
  (table) => ({
    roomIdx: index('chat_room_users_room_idx').on(table.roomId),
    userIdx: index('chat_room_users_user_idx').on(table.userId),
    selfIdx: index('chat_room_users_self_idx').on(table.isSelf),
  }),
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => chatRooms.id, { onDelete: 'cascade' }),
    senderId: text('sender_id').notNull(),
    senderNick: text('sender_nick').notNull(),
    type: text('type').$type<ChatMessageType>().notNull().default('groupchat'),
    content: text('content').notNull(),
    timestamp: integer('timestamp').notNull(),
    recipientId: text('recipient_id'), // for privatechat
    amazMsgId: text('amaz_msg_id'),
  },
  (table) => ({
    roomIdx: index('chat_messages_room_idx').on(table.roomId, table.timestamp),
    amazMsgIdIdx: uniqueIndex('chat_messages_amaz_msg_id_idx').on(table.amazMsgId),
  }),
);

/* -------------------------------------------------------------------------- */
/* settings                                                                   */
/* -------------------------------------------------------------------------- */

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON-stringified value. */
  value: text('value').notNull(),
});

/* -------------------------------------------------------------------------- */
/* relations                                                                  */
/* -------------------------------------------------------------------------- */

export const buddiesRelations = relations(buddies, ({ many }) => ({
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  buddy: one(buddies, {
    fields: [conversations.buddyId],
    references: [buddies.userId],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const chatRoomsRelations = relations(chatRooms, ({ many }) => ({
  users: many(chatRoomUsers),
  messages: many(chatMessages),
}));

export const chatRoomUsersRelations = relations(chatRoomUsers, ({ one }) => ({
  room: one(chatRooms, {
    fields: [chatRoomUsers.roomId],
    references: [chatRooms.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  room: one(chatRooms, {
    fields: [chatMessages.roomId],
    references: [chatRooms.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type BuddyRow = typeof buddies.$inferSelect;
export type NewBuddyRow = typeof buddies.$inferInsert;
export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type ChatRoomRow = typeof chatRooms.$inferSelect;
export type NewChatRoomRow = typeof chatRooms.$inferInsert;
export type ChatRoomUserRow = typeof chatRoomUsers.$inferSelect;
export type NewChatRoomUserRow = typeof chatRoomUsers.$inferInsert;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessageRow = typeof chatMessages.$inferInsert;
export type SettingRow = typeof settings.$inferSelect;
export type NewSettingRow = typeof settings.$inferInsert;

export const schema = {
  users,
  buddies,
  conversations,
  messages,
  chatRooms,
  chatRoomUsers,
  chatMessages,
  settings,
  buddiesRelations,
  conversationsRelations,
  messagesRelations,
  chatRoomsRelations,
  chatRoomUsersRelations,
  chatMessagesRelations,
};

export type DatabaseSchema = typeof schema;
