import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { db } from '../db/client';
import { chatRooms as chatRoomsTable } from '../db/schema';
import { chatRoomUsers as chatRoomUsersTable } from '../db/schema';
import { chatMessages as chatMessagesTable } from '../db/schema';
import type { ChatRoomRow, ChatRoomUserRow, ChatMessageRow } from '../db/schema';
import { useUzzapStore } from '../store';
import type {
  ChatRoom,
  ChatRoomUser,
  ChatMessage,
  CreateRoomInput,
} from '../types/models';
import type { ChatRoomType, ChatMessageType } from '../types/protocol';
import { supabase } from './supabaseClient';

/**
 * Chat room management on Supabase (`chat_rooms`, `chat_room_users`,
 * `chat_messages` tables + Realtime).
 *
 * Local identity stays the legacy username (`store.user.id`); the server
 * keys membership by auth uid (`member_id`) with a `username` column for
 * display mapping. Room passwords are SHA-256 hashes compared client-side
 * (see schema notes). Moderator management is enforced by RLS policies.
 *
 * Public API is unchanged so screens keep working without modification.
 */

interface ServerRoomRow {
  id: string;
  name: string;
  type: string;
  topic: string | null;
  max_users: number;
  password_protected: boolean;
  password_hash: string | null;
  creator_id: string | null;
  created_at: number;
  last_active_at: number | null;
}

interface ServerRoomUserRow {
  room_id: string;
  member_id: string;
  username: string;
  nick: string;
  role: 'moderator' | 'participant' | 'visitor';
  status: string;
  joined_at: number;
  last_seen: number | null;
}

interface ServerChatMessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_nick: string;
  type: string;
  content: string;
  timestamp: number;
  recipient_id: string | null;
  amaz_msg_id: string | null;
  is_read: boolean;
}

function rowToChatRoom(row: ChatRoomRow): ChatRoom {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    maxUsers: row.maxUsers,
    passwordProtected: row.passwordProtected,
    creatorId: row.creatorId ?? undefined,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt ?? undefined,
    isJoined: row.isJoined,
    myNick: row.myNick ?? undefined,
    unreadCount: row.unreadCount ?? 0,
  };
}

function rowToChatRoomUser(row: ChatRoomUserRow): ChatRoomUser {
  return {
    userId: row.userId,
    roomId: row.roomId,
    nick: row.nick,
    role: row.role,
    status: row.status,
    isSelf: row.isSelf,
    joinedAt: row.joinedAt,
    lastSeen: row.lastSeen ?? undefined,
  };
}

function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    roomId: row.roomId,
    senderId: row.senderId,
    senderNick: row.senderNick,
    type: row.type,
    content: row.content,
    timestamp: row.timestamp,
    recipientId: row.recipientId ?? undefined,
    amazMsgId: row.amazMsgId ?? undefined,
    isRead: row.isRead ?? false,
    status: 'delivered',
  };
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

async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
}

export class ChatRoomService {
  private chatChannel: RealtimeChannel | null = null;

  /* ---------------------------------------------------------------------- */
  /* Local reads                                                            */
  /* ---------------------------------------------------------------------- */

  async listRooms(type?: ChatRoomType): Promise<ChatRoom[]> {
    const store = useUzzapStore.getState();
    const rooms = Object.values(store.chatRooms);
    if (type) {
      return rooms.filter((r) => r.type === type);
    }
    return rooms;
  }

  async getRoom(roomId: string): Promise<ChatRoom | undefined> {
    return useUzzapStore.getState().chatRooms[roomId];
  }

  async getRoomUsers(roomId: string): Promise<ChatRoomUser[]> {
    const store = useUzzapStore.getState();
    return Object.values(store.chatRoomUsers).filter((u) => u.roomId === roomId);
  }

  async getRoomMessages(roomId: string, limit = 50): Promise<ChatMessage[]> {
    const store = useUzzapStore.getState();
    return (store.chatMessagesByRoom[roomId] ?? []).slice(-limit);
  }

  /* ---------------------------------------------------------------------- */
  /* Realtime                                                               */
  /* ---------------------------------------------------------------------- */

  /** Live room messages + membership for joined rooms. Idempotent. */
  subscribeChat(): () => void {
    if (this.chatChannel) return () => undefined;
    const channel = supabase
      .channel('chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          void this.handleRemoteChatMessage(payload.new as unknown as ServerChatMessageRow);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_room_users' },
        (payload) => {
          const row = (payload.new ?? payload.old ?? {}) as unknown as ServerRoomUserRow;
          if (payload.eventType === 'DELETE') {
            void this.handleMemberLeft(row);
          } else {
            void this.handleMemberUpsert(row);
          }
        },
      )
      .subscribe();
    this.chatChannel = channel;
    return () => {
      void supabase.removeChannel(channel);
      if (this.chatChannel === channel) this.chatChannel = null;
    };
  }

  unsubscribeChat(): void {
    if (!this.chatChannel) return;
    const channel = this.chatChannel;
    this.chatChannel = null;
    void supabase.removeChannel(channel);
  }

  /* ---------------------------------------------------------------------- */
  /* Rooms                                                                  */
  /* ---------------------------------------------------------------------- */

  async createRoom(input: CreateRoomInput): Promise<ChatRoom> {
    const now = Math.floor(Date.now() / 1000);
    const self = await selfIdentity();
    const selfId = self?.username ?? useUzzapStore.getState().user?.id ?? 'self';
    const roomId = uuidv4();

    const room: ChatRoom = {
      id: roomId,
      name: input.name,
      type: input.type,
      maxUsers: input.maxUsers ?? 20,
      passwordProtected: !!input.password,
      creatorId: selfId,
      createdAt: now,
      lastActiveAt: now,
      isJoined: true,
      myNick: input.nick,
      unreadCount: 0,
    };

    const roomUser: ChatRoomUser = {
      userId: selfId,
      roomId,
      nick: input.nick,
      role: 'moderator',
      status: 'online',
      isSelf: true,
      joinedAt: now,
    };

    if (self) {
      const { error } = await supabase.from('chat_rooms').insert({
        id: roomId,
        name: input.name,
        type: input.type,
        topic: '',
        max_users: input.maxUsers ?? 20,
        password_protected: !!input.password,
        password_hash: input.password ? await hashPassword(input.password) : null,
        creator_id: self.uid,
        created_at: now,
        last_active_at: now,
      });
      if (error) throw new Error(error.message);
      await supabase.from('chat_room_users').insert({
        room_id: roomId,
        member_id: self.uid,
        username: selfId,
        nick: input.nick,
        role: 'moderator',
        status: 'online',
        joined_at: now,
      });
    }

    useUzzapStore.getState().upsertChatRoom(room);
    useUzzapStore.getState().upsertChatRoomUser(roomUser);
    await this.persistRoom(room);
    await this.persistRoomUser(roomUser);

    return room;
  }

  async joinRoom(roomId: string, nick: string, password?: string): Promise<ChatRoom | null> {
    const self = await selfIdentity();
    const selfId = self?.username ?? useUzzapStore.getState().user?.id ?? 'self';
    const now = Math.floor(Date.now() / 1000);

    // Password gate is enforced client-side against the stored hash.
    const { data: remote, error: fetchError } = await supabase
      .from('chat_rooms')
      .select('id, name, type, topic, max_users, password_protected, password_hash, creator_id, created_at, last_active_at')
      .eq('id', roomId)
      .maybeSingle();
    if (fetchError || !remote) return null;
    const server = remote as unknown as ServerRoomRow;
    if (server.password_protected && server.password_hash) {
      if (!password || (await hashPassword(password)) !== server.password_hash) {
        throw new Error('not-authorized');
      }
    }

    if (self) {
      const { error } = await supabase.from('chat_room_users').upsert(
        {
          room_id: roomId,
          member_id: self.uid,
          username: selfId,
          nick,
          role: 'participant',
          status: 'online',
          joined_at: now,
        },
        { onConflict: 'room_id,member_id' },
      );
      if (error) throw new Error(error.message);
    }

    const room: ChatRoom = {
      id: server.id,
      name: server.name,
      type: (server.type as ChatRoom['type']) ?? 'generated',
      maxUsers: server.max_users ?? 20,
      passwordProtected: server.password_protected ?? false,
      creatorId: server.creator_id ?? undefined,
      createdAt: server.created_at ?? now,
      lastActiveAt: server.last_active_at ?? undefined,
      isJoined: true,
      myNick: nick,
      unreadCount: 0,
    };
    const roomUser: ChatRoomUser = {
      userId: selfId,
      roomId,
      nick,
      role: 'participant',
      status: 'online',
      isSelf: true,
      joinedAt: now,
    };

    useUzzapStore.getState().upsertChatRoom(room);
    useUzzapStore.getState().upsertChatRoomUser(roomUser);
    await this.persistRoom(room);
    await this.persistRoomUser(roomUser);
    await this.hydrateRoomUsers(roomId);
    await this.hydrateRoomMessages(roomId);

    return room;
  }

  async leaveRoom(roomId: string): Promise<void> {
    const self = await selfIdentity();
    const selfId = self?.username ?? useUzzapStore.getState().user?.id ?? 'self';

    if (self) {
      await supabase
        .from('chat_room_users')
        .delete()
        .eq('room_id', roomId)
        .eq('member_id', self.uid);
    }

    useUzzapStore.getState().removeChatRoomUser(roomId, selfId);
    useUzzapStore.getState().updateChatRoom(roomId, { isJoined: false });
    await db
      .delete(chatRoomUsersTable)
      .where(eq(chatRoomUsersTable.id, `${roomId}:${selfId}`))
      .run();
    const current = useUzzapStore.getState().chatRooms[roomId];
    if (current) await this.persistRoom({ ...current, isJoined: false });
  }

  /* ---------------------------------------------------------------------- */
  /* Messaging                                                              */
  /* ---------------------------------------------------------------------- */

  async sendMessage(input: {
    roomId: string;
    body: string;
    type?: ChatMessageType;
    recipientId?: string;
  }): Promise<ChatMessage> {
    const now = Math.floor(Date.now() / 1000);
    const selfId = useUzzapStore.getState().user?.id ?? 'self';
    const myNick = useUzzapStore.getState().chatRooms[input.roomId]?.myNick ?? selfId;
    const id = uuidv4();

    const message: ChatMessage = {
      id,
      roomId: input.roomId,
      senderId: selfId,
      senderNick: myNick,
      type: input.type ?? 'groupchat',
      content: input.body,
      timestamp: now,
      recipientId: input.recipientId,
      status: 'sending',
      isRead: true,
    };

    useUzzapStore.getState().appendChatMessage(message);
    await this.persistChatMessage(message);

    const { error } = await supabase.from('chat_messages').insert({
      id,
      room_id: input.roomId,
      sender_id: selfId,
      sender_nick: myNick,
      type: input.type ?? 'groupchat',
      content: input.body,
      timestamp: now,
      recipient_id: input.recipientId ?? null,
      is_read: true,
    });
    if (error) {
      useUzzapStore.getState().updateChatMessageStatus(input.roomId, id, 'failed');
      throw new Error(error.message);
    }
    useUzzapStore.getState().updateChatMessageStatus(input.roomId, id, 'sent');
    return message;
  }

  async handleRemoteChatMessage(row: ServerChatMessageRow): Promise<ChatMessage | null> {
    const store = useUzzapStore.getState();
    const selfId = store.user?.id ?? '';
    if (row.sender_id === selfId) return null;
    const room = store.chatRooms[row.room_id];
    if (!room || !room.isJoined) return null;

    const alreadySeen = (store.chatMessagesByRoom[row.room_id] ?? []).some(
      (m) => m.id === row.id,
    );
    if (alreadySeen) return null;

    if (row.type === 'invite') {
      store.addChatInvite({
        roomId: row.room_id,
        from: row.sender_id,
        body: row.content,
        timestamp: row.timestamp,
      });
    }

    const message: ChatMessage = {
      id: row.id,
      roomId: row.room_id,
      senderId: row.sender_id,
      senderNick: row.sender_nick || row.sender_id,
      type: (row.type as ChatMessage['type']) ?? 'groupchat',
      content: row.content,
      timestamp: row.timestamp,
      recipientId: row.recipient_id ?? undefined,
      amazMsgId: row.amaz_msg_id ?? undefined,
      isRead: false,
      status: 'delivered',
    };

    store.appendChatMessage(message);
    await this.persistChatMessage(message);
    return message;
  }

  private async handleMemberUpsert(row: ServerRoomUserRow): Promise<void> {
    if (!row.room_id) return;
    const store = useUzzapStore.getState();
    const selfUsername = store.user?.id;
    const username = row.username || row.nick;
    if (!username) return;
    store.upsertChatRoomUser({
      userId: username,
      roomId: row.room_id,
      nick: row.nick || username,
      role: row.role ?? 'participant',
      status: (row.status as ChatRoomUser['status']) ?? 'online',
      isSelf: username === selfUsername,
      joinedAt: row.joined_at ?? Math.floor(Date.now() / 1000),
      lastSeen: row.last_seen ?? undefined,
    });
  }

  private async handleMemberLeft(row: ServerRoomUserRow): Promise<void> {
    if (!row.room_id) return;
    const username = row.username || row.nick;
    if (!username) return;
    useUzzapStore.getState().removeChatRoomUser(row.room_id, username);
    await db
      .delete(chatRoomUsersTable)
      .where(eq(chatRoomUsersTable.id, `${row.room_id}:${username}`))
      .run();
  }

  /* ---------------------------------------------------------------------- */
  /* Moderation                                                             */
  /* ---------------------------------------------------------------------- */

  /** Kick = remove the membership row (moderators only, enforced by RLS). */
  async kickUser(roomId: string, targetUserId: string, _reason?: string): Promise<void> {
    const { data: target } = await supabase
      .from('chat_room_users')
      .select('member_id')
      .eq('room_id', roomId)
      .eq('username', targetUserId)
      .maybeSingle();
    const memberId = (target as { member_id?: string } | null)?.member_id;
    if (!memberId) throw new Error('not-authorized');
    const { error } = await supabase
      .from('chat_room_users')
      .delete()
      .eq('room_id', roomId)
      .eq('member_id', memberId);
    if (error) throw new Error(error.message);
    useUzzapStore.getState().removeChatRoomUser(roomId, targetUserId);
  }

  /**
   * Ban = remove the membership row. There is no persistent ban list in v1,
   * so a banned user could rejoin an open room (documented limitation).
   */
  async banUser(roomId: string, targetUserId: string, reason?: string): Promise<void> {
    await this.kickUser(roomId, targetUserId, reason);
  }

  async setUserRole(
    roomId: string,
    targetUserId: string,
    role: 'moderator' | 'participant' | 'visitor',
  ): Promise<void> {
    const { data: target } = await supabase
      .from('chat_room_users')
      .select('member_id')
      .eq('room_id', roomId)
      .eq('username', targetUserId)
      .maybeSingle();
    const memberId = (target as { member_id?: string } | null)?.member_id;
    if (!memberId) throw new Error('not-authorized');
    const { error } = await supabase
      .from('chat_room_users')
      .update({ role })
      .eq('room_id', roomId)
      .eq('member_id', memberId);
    if (error) throw new Error(error.message);
    const existing = useUzzapStore
      .getState()
      .chatRoomUsers[`${roomId}:${targetUserId}`];
    if (existing) useUzzapStore.getState().upsertChatRoomUser({ ...existing, role });
  }

  async setRoomTopic(roomId: string, topic: string): Promise<void> {
    const { error } = await supabase
      .from('chat_rooms')
      .update({ topic, last_active_at: Math.floor(Date.now() / 1000) })
      .eq('id', roomId);
    if (error) throw new Error(error.message);
  }

  async setRoomPassword(roomId: string, password: string): Promise<void> {
    const { error } = await supabase
      .from('chat_rooms')
      .update({
        password_protected: password.length > 0,
        password_hash: password ? await hashPassword(password) : null,
      })
      .eq('id', roomId);
    if (error) throw new Error(error.message);
    useUzzapStore.getState().updateChatRoom(roomId, { passwordProtected: password.length > 0 });
  }

  /* ---------------------------------------------------------------------- */
  /* Sync                                                                   */
  /* ---------------------------------------------------------------------- */

  async syncRooms(): Promise<ChatRoom[]> {
    const store = useUzzapStore.getState();
    store.setSyncingChatRooms(true);
    try {
      const { data, error } = await supabase
        .from('chat_rooms')
        .select('id, name, type, topic, max_users, password_protected, creator_id, created_at, last_active_at')
        .order('last_active_at', { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      const now = Math.floor(Date.now() / 1000);
      const rooms: ChatRoom[] = (data ?? []).map((r) => {
        const row = r as unknown as ServerRoomRow;
        const existing = store.chatRooms[row.id];
        return {
          id: row.id,
          name: row.name,
          type: (row.type as ChatRoom['type']) ?? 'generated',
          maxUsers: row.max_users ?? 20,
          passwordProtected: row.password_protected ?? false,
          creatorId: row.creator_id ?? undefined,
          createdAt: row.created_at ?? now,
          lastActiveAt: row.last_active_at ?? undefined,
          isJoined: existing?.isJoined ?? false,
          myNick: existing?.myNick,
          unreadCount: existing?.unreadCount ?? 0,
        };
      });
      if (rooms.length > 0) {
        store.setChatRooms(rooms);
        await this.persistRooms(rooms);
      }
      return rooms;
    } catch {
      return Object.values(store.chatRooms);
    } finally {
      store.setSyncingChatRooms(false);
    }
  }

  async hydrateRoomUsers(roomId: string): Promise<ChatRoomUser[]> {
    const { data } = await supabase
      .from('chat_room_users')
      .select('room_id, member_id, username, nick, role, status, joined_at, last_seen')
      .eq('room_id', roomId);
    if (!data) return [];
    const selfUsername = useUzzapStore.getState().user?.id;
    const users: ChatRoomUser[] = (data as unknown as ServerRoomUserRow[]).map((row) => ({
      userId: row.username || row.nick,
      roomId: row.room_id,
      nick: row.nick || row.username,
      role: row.role ?? 'participant',
      status: (row.status as ChatRoomUser['status']) ?? 'online',
      isSelf: (row.username || row.nick) === selfUsername,
      joinedAt: row.joined_at ?? Math.floor(Date.now() / 1000),
      lastSeen: row.last_seen ?? undefined,
    }));
    useUzzapStore.getState().setChatRoomUsers(users);
    return users;
  }

  async hydrateRoomMessages(roomId: string, limit = 50): Promise<ChatMessage[]> {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, sender_nick, type, content, timestamp, recipient_id, amaz_msg_id, is_read')
      .eq('room_id', roomId)
      .order('timestamp', { ascending: true })
      .limit(limit);
    if (!data) return [];
    const messages: ChatMessage[] = (data as unknown as ServerChatMessageRow[]).map((row) => ({
      id: row.id,
      roomId: row.room_id,
      senderId: row.sender_id,
      senderNick: row.sender_nick || row.sender_id,
      type: (row.type as ChatMessage['type']) ?? 'groupchat',
      content: row.content,
      timestamp: row.timestamp,
      recipientId: row.recipient_id ?? undefined,
      amazMsgId: row.amaz_msg_id ?? undefined,
      isRead: row.is_read ?? false,
      status: 'delivered',
    }));
    const store = useUzzapStore.getState();
    for (const message of messages) store.upsertChatMessage(message);
    return messages;
  }

  async hydrateFromDatabase(): Promise<{
    rooms: ChatRoom[];
    users: ChatRoomUser[];
    messages: ChatMessage[];
  }> {
    const roomRows = await db.select().from(chatRoomsTable).all();
    const rooms = roomRows.map(rowToChatRoom);
    useUzzapStore.getState().setChatRooms(rooms);

    const userRows = await db.select().from(chatRoomUsersTable).all();
    const users = userRows.map(rowToChatRoomUser);
    useUzzapStore.getState().setChatRoomUsers(users);

    const messageRows = await db.select().from(chatMessagesTable).all();
    const messages = messageRows.map(rowToChatMessage);
    useUzzapStore.getState().setChatMessagesByRoom(messages);

    return { rooms, users, messages };
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private async persistRoom(room: ChatRoom): Promise<void> {
    const values = {
      id: room.id,
      name: room.name,
      type: room.type,
      maxUsers: room.maxUsers,
      passwordProtected: room.passwordProtected,
      creatorId: room.creatorId ?? null,
      createdAt: room.createdAt,
      lastActiveAt: room.lastActiveAt ?? null,
      isJoined: room.isJoined,
      myNick: room.myNick ?? null,
      unreadCount: room.unreadCount ?? 0,
    };
    await db
      .insert(chatRoomsTable)
      .values(values)
      .onConflictDoUpdate({
        target: chatRoomsTable.id,
        set: values,
      })
      .run();
  }

  private async persistRooms(rooms: ChatRoom[]): Promise<void> {
    for (const room of rooms) await this.persistRoom(room);
  }

  private async persistRoomUser(user: ChatRoomUser): Promise<void> {
    const values = {
      id: `${user.roomId}:${user.userId}`,
      roomId: user.roomId,
      userId: user.userId,
      nick: user.nick,
      role: user.role,
      status: user.status,
      isSelf: user.isSelf,
      joinedAt: user.joinedAt,
      lastSeen: user.lastSeen ?? null,
    };
    await db
      .insert(chatRoomUsersTable)
      .values(values)
      .onConflictDoUpdate({
        target: chatRoomUsersTable.id,
        set: values,
      })
      .run();
  }

  private async persistChatMessage(message: ChatMessage): Promise<void> {
    const values = {
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      senderNick: message.senderNick,
      type: message.type,
      content: message.content,
      timestamp: message.timestamp,
      recipientId: message.recipientId ?? null,
      amazMsgId: message.amazMsgId ?? null,
      isRead: message.isRead,
    };
    await db
      .insert(chatMessagesTable)
      .values(values)
      .onConflictDoUpdate({
        target: chatMessagesTable.id,
        set: values,
      })
      .run();
  }

}

export const chatRoomService = new ChatRoomService();

export const listChatRooms = (type?: ChatRoomType): Promise<ChatRoom[]> =>
  chatRoomService.listRooms(type);
export const getChatRoom = (roomId: string): Promise<ChatRoom | undefined> =>
  chatRoomService.getRoom(roomId);
export const getChatRoomUsers = (roomId: string): Promise<ChatRoomUser[]> =>
  chatRoomService.getRoomUsers(roomId);
export const getChatRoomMessages = (roomId: string, limit?: number): Promise<ChatMessage[]> =>
  chatRoomService.getRoomMessages(roomId, limit);
export const createChatRoom = (input: CreateRoomInput): Promise<ChatRoom> =>
  chatRoomService.createRoom(input);
export const joinChatRoom = (
  roomId: string,
  nick: string,
  password?: string,
): Promise<ChatRoom | null> => chatRoomService.joinRoom(roomId, nick, password);
export const leaveChatRoom = (roomId: string): Promise<void> => chatRoomService.leaveRoom(roomId);
export const sendChatMessage = (input: {
  roomId: string;
  body: string;
  type?: ChatMessageType;
  recipientId?: string;
}): Promise<ChatMessage> => chatRoomService.sendMessage(input);
export const syncChatRooms = (): Promise<ChatRoom[]> => chatRoomService.syncRooms();
export const hydrateChatRooms = (): Promise<{
  rooms: ChatRoom[];
  users: ChatRoomUser[];
  messages: ChatMessage[];
}> => chatRoomService.hydrateFromDatabase();
export const kickChatRoomUser = (
  roomId: string,
  targetUserId: string,
  reason?: string,
): Promise<void> => chatRoomService.kickUser(roomId, targetUserId, reason);
export const banChatRoomUser = (
  roomId: string,
  targetUserId: string,
  reason?: string,
): Promise<void> => chatRoomService.banUser(roomId, targetUserId, reason);
export const setChatRoomUserRole = (
  roomId: string,
  targetUserId: string,
  role: 'moderator' | 'participant' | 'visitor',
): Promise<void> => chatRoomService.setUserRole(roomId, targetUserId, role);
export const setChatRoomTopic = (roomId: string, topic: string): Promise<void> =>
  chatRoomService.setRoomTopic(roomId, topic);
export const setChatRoomPassword = (roomId: string, password: string): Promise<void> =>
  chatRoomService.setRoomPassword(roomId, password);
