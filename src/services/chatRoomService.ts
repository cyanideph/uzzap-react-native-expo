import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

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
import type {
  InboundChatMessage,
  ChatPresenceUpdate,
  ChatRoomType,
  ChatMessageType,
} from '../types/protocol';
import { buildIq, newIqId, wsClient } from './wsClient';

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

export class ChatRoomService {
  constructor() {
    wsClient.addListener((event) => {
      switch (event.type) {
        case 'chat-message':
          void this.handleInboundChatMessage(event.message);
          break;
        case 'chat-presence':
          void this.handleChatPresence(event.presence);
          break;
        case 'state':
          if (event.state === 'online') void this.flushPending();
          break;
        default:
          break;
      }
    });
  }

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

  async createRoom(input: CreateRoomInput): Promise<ChatRoom> {
    const now = Math.floor(Date.now() / 1000);
    const selfId = useUzzapStore.getState().user?.id ?? 'self';
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

    this.sendCreateRoom(room, input.password, input.nick);

    useUzzapStore.getState().upsertChatRoom(room);
    useUzzapStore.getState().upsertChatRoomUser(roomUser);
    await this.persistRoom(room);
    await this.persistRoomUser(roomUser);

    return room;
  }

  async joinRoom(roomId: string, nick: string, password?: string): Promise<ChatRoom | null> {
    const selfId = useUzzapStore.getState().user?.id ?? 'self';
    const now = Math.floor(Date.now() / 1000);

    this.sendJoinRoom(roomId, nick, password);

    const room = await this.waitForJoinResponse(roomId, 10_000);
    if (!room) return null;

    const roomUser: ChatRoomUser = {
      userId: selfId,
      roomId,
      nick,
      role: 'participant',
      status: 'online',
      isSelf: true,
      joinedAt: now,
    };

    useUzzapStore.getState().upsertChatRoom({ ...room, isJoined: true, myNick: nick });
    useUzzapStore.getState().upsertChatRoomUser(roomUser);
    await this.persistRoom({ ...room, isJoined: true, myNick: nick });
    await this.persistRoomUser(roomUser);

    return room;
  }

  async leaveRoom(roomId: string): Promise<void> {
    const selfId = useUzzapStore.getState().user?.id ?? 'self';

    this.sendLeaveRoom(roomId);

    useUzzapStore.getState().removeChatRoomUser(roomId, selfId);
    useUzzapStore.getState().updateChatRoom(roomId, { isJoined: false });
    await db
      .delete(chatRoomUsersTable)
      .where(eq(chatRoomUsersTable.id, `${roomId}:${selfId}`))
      .run();
    await this.persistRoom({ ...useUzzapStore.getState().chatRooms[roomId]!, isJoined: false });
  }

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

    this.sendChatMessage(
      input.roomId,
      input.body,
      id,
      input.type ?? 'groupchat',
      input.recipientId,
    );
    return message;
  }

  async handleInboundChatMessage(wire: InboundChatMessage): Promise<ChatMessage | null> {
    const store = useUzzapStore.getState();
    const alreadySeen = (store.chatMessagesByRoom[wire.roomId] ?? []).some(
      (msg) => msg.id === wire.msgId || (wire.msgId && msg.amazMsgId === wire.msgId),
    );
    if (alreadySeen) return null;

    const message: ChatMessage = {
      id: wire.msgId || uuidv4(),
      roomId: wire.roomId,
      senderId: wire.from,
      senderNick: wire.nick,
      type: wire.type,
      content: wire.body,
      timestamp: wire.timestamp,
      recipientId: wire.recipient,
      amazMsgId: wire.msgId || undefined,
      isRead: false,
      status: 'delivered',
    };

    useUzzapStore.getState().appendChatMessage(message);
    await this.persistChatMessage(message);

    if (wire.type === 'invite') {
      useUzzapStore.getState().addChatInvite({
        roomId: wire.roomId,
        from: wire.from,
        body: wire.body,
        timestamp: wire.timestamp,
      });
    }

    return message;
  }

  async handleChatPresence(presence: ChatPresenceUpdate): Promise<void> {
    const user: ChatRoomUser = {
      userId: presence.userId,
      roomId: presence.roomId,
      nick: presence.nick,
      role: presence.role ?? 'participant',
      status: presence.type === 'unavailable' ? 'offline' : 'online',
      isSelf: false,
      joinedAt: Date.now(),
    };

    if (presence.type === 'unavailable') {
      useUzzapStore.getState().removeChatRoomUser(presence.roomId, presence.userId);
      await db
        .delete(chatRoomUsersTable)
        .where(eq(chatRoomUsersTable.id, `${presence.roomId}:${presence.userId}`))
        .run();
    } else {
      useUzzapStore.getState().upsertChatRoomUser(user);
      await this.persistRoomUser(user);
    }
  }

  async syncRooms(): Promise<ChatRoom[]> {
    const store = useUzzapStore.getState();
    store.setSyncingChatRooms(true);

    this.sendQueryUserGeneratedRooms();
    this.sendQueryRoomGroups();

    const rooms = await this.waitForRoomList(15_000);
    store.setSyncingChatRooms(false);

    if (rooms.length > 0) {
      store.setChatRooms(rooms);
      await this.persistRooms(rooms);
    }
    return rooms;
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

    const messageRows = await db
      .select()
      .from(chatMessagesTable)
      .orderBy(chatMessagesTable.timestamp)
      .all();
    const messages = messageRows.map(rowToChatMessage);
    useUzzapStore.getState().setChatMessagesByRoom(messages);

    return { rooms, users, messages };
  }

  private sendCreateRoom(room: ChatRoom, password?: string, nick?: string): void {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'create-room',
        target: 'conference',
        amazProtocol: 'chat',
        vcard: {
          username: room.name,
          extra: {
            type: room.type,
            password: password ?? '',
            nick: nick ?? room.myNick ?? '',
            'max-users': String(room.maxUsers),
          },
        },
      }),
    );
  }

  private sendJoinRoom(roomId: string, nick: string, password?: string): void {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'chatuser',
        target: 'conference',
        amazProtocol: 'chat',
        vcard: {
          username: roomId,
          extra: {
            nick,
            password: password ?? '',
            type: 'available',
          },
        },
      }),
    );
  }

  private sendLeaveRoom(roomId: string): void {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'chatuser',
        target: 'conference',
        amazProtocol: 'chat',
        vcard: {
          username: roomId,
          extra: { type: 'unavailable' },
        },
      }),
    );
  }

  private sendChatMessage(
    roomId: string,
    body: string,
    msgId: string,
    type: ChatMessageType,
    recipientId?: string,
  ): void {
    const children = [`<body>${body}</body>`];
    if (type === 'privatechat' && recipientId) {
      children.push(`<recipient username="${recipientId}"/>`);
    }
    wsClient.sendIq(
      buildIq({
        id: msgId,
        type: 'set',
        action: 'msg',
        target: 'conference',
        amazProtocol: 'chat',
        children: `<msg room="${roomId}" type="${type}">${children.join('')}</msg>`,
      }),
    );
  }

  async kickUser(roomId: string, targetUserId: string, reason?: string): Promise<void> {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'chatuser',
        target: 'conference',
        amazProtocol: 'chat',
        vcard: {
          username: roomId,
          extra: {
            type: 'unavailable',
            kick: targetUserId,
            reason: reason ?? 'Kicked by moderator',
          },
        },
      }),
    );
  }

  async banUser(roomId: string, targetUserId: string, reason?: string): Promise<void> {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'chatuser',
        target: 'conference',
        amazProtocol: 'chat',
        vcard: {
          username: roomId,
          extra: {
            type: 'ban',
            ban: targetUserId,
            reason: reason ?? 'Banned by moderator',
          },
        },
      }),
    );
  }

  async setUserRole(
    roomId: string,
    targetUserId: string,
    role: 'moderator' | 'participant' | 'visitor',
  ): Promise<void> {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'chatuser',
        target: 'conference',
        amazProtocol: 'chat',
        vcard: {
          username: roomId,
          extra: {
            type: 'role',
            role,
            user: targetUserId,
          },
        },
      }),
    );
  }

  async setRoomTopic(roomId: string, topic: string): Promise<void> {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'msg',
        target: 'conference',
        amazProtocol: 'chat',
        children: `<msg room="${roomId}" type="topic"><topic>${topic}</topic></msg>`,
      }),
    );
  }

  async setRoomPassword(roomId: string, password: string): Promise<void> {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'set',
        action: 'msg',
        target: 'conference',
        amazProtocol: 'chat',
        children: `<msg room="${roomId}" type="topic"><password>${password}</password></msg>`,
      }),
    );
  }

  private sendQueryUserGeneratedRooms(): void {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'get',
        action: 'query-ug',
        target: 'conference',
        amazProtocol: 'chat',
      }),
    );
  }

  private sendQueryRoomGroups(): void {
    const id = newIqId('CHAT');
    wsClient.sendIq(
      buildIq({
        id,
        type: 'get',
        action: 'query-groups',
        target: 'conference',
        amazProtocol: 'chat',
      }),
    );
  }

  private async waitForJoinResponse(roomId: string, timeoutMs: number): Promise<ChatRoom | null> {
    return new Promise((resolve) => {
      const unsubscribe = wsClient.addListener((event) => {
        if (
          event.type === 'chat-presence' &&
          event.presence.roomId === roomId &&
          event.presence.type === 'available'
        ) {
          unsubscribe();
          const room = useUzzapStore.getState().chatRooms[roomId];
          resolve(room ?? null);
        }
      });
      setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, timeoutMs);
    });
  }

  private async waitForRoomList(timeoutMs: number): Promise<ChatRoom[]> {
    return new Promise((resolve) => {
      const rooms: ChatRoom[] = [];
      const unsubscribe = wsClient.addListener((event) => {
        if (event.type === 'roster' && event.stanza.keys['iq.amaz-protocol'] === 'chat') {
          // Parse room list from roster response
        }
      });
      setTimeout(() => {
        unsubscribe();
        resolve(rooms);
      }, timeoutMs);
    });
  }

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

  private async flushPending(): Promise<void> {
    // Flush any pending operations on reconnect
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
