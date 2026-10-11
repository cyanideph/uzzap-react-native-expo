import type { ChatRoom, ChatRoomUser, ChatMessage, ChatInvite } from '../../types/models';
import type { UzzapSlice } from '../index';

export interface ChatRoomsSlice {
  chatRooms: Record<string, ChatRoom>;
  chatRoomUsers: Record<string, ChatRoomUser>;
  chatMessagesByRoom: Record<string, ChatMessage[]>;
  chatInvites: ChatInvite[];
  syncingChatRooms: boolean;

  upsertChatRoom: (room: ChatRoom) => void;
  setChatRooms: (rooms: ChatRoom[]) => void;
  removeChatRoom: (roomId: string) => void;
  updateChatRoom: (roomId: string, partial: Partial<ChatRoom>) => void;

  upsertChatRoomUser: (user: ChatRoomUser) => void;
  setChatRoomUsers: (users: ChatRoomUser[]) => void;
  removeChatRoomUser: (roomId: string, userId: string) => void;

  appendChatMessage: (message: ChatMessage) => void;
  setChatMessagesByRoom: (messages: ChatMessage[]) => void;
  clearChatMessages: (roomId: string) => void;

  addChatInvite: (invite: ChatInvite) => void;
  removeChatInvite: (roomId: string, from: string) => void;

  setSyncingChatRooms: (syncing: boolean) => void;
}

export const createChatRoomsSlice: UzzapSlice<ChatRoomsSlice> = (set, get) => ({
  chatRooms: {},
  chatRoomUsers: {},
  chatMessagesByRoom: {},
  chatInvites: [],
  syncingChatRooms: false,

  upsertChatRoom: (room) =>
    set((state) => {
      state.chatRooms[room.id] = room;
    }),

  setChatRooms: (rooms) =>
    set((state) => {
      for (const room of rooms) {
        state.chatRooms[room.id] = room;
      }
    }),

  removeChatRoom: (roomId) =>
    set((state) => {
      delete state.chatRooms[roomId];
      delete state.chatMessagesByRoom[roomId];
      Object.keys(state.chatRoomUsers)
        .filter((key) => key.startsWith(`${roomId}:`))
        .forEach((key) => delete state.chatRoomUsers[key]);
    }),

  updateChatRoom: (roomId, partial) =>
    set((state) => {
      const room = state.chatRooms[roomId];
      if (room) {
        Object.assign(room, partial);
      }
    }),

  upsertChatRoomUser: (user) =>
    set((state) => {
      state.chatRoomUsers[`${user.roomId}:${user.userId}`] = user;
    }),

  setChatRoomUsers: (users) =>
    set((state) => {
      for (const user of users) {
        state.chatRoomUsers[`${user.roomId}:${user.userId}`] = user;
      }
    }),

  removeChatRoomUser: (roomId, userId) =>
    set((state) => {
      delete state.chatRoomUsers[`${roomId}:${userId}`];
    }),

  appendChatMessage: (message) =>
    set((state) => {
      const history = state.chatMessagesByRoom[message.roomId] ?? [];
      if (history.some((m) => m.id === message.id)) return;
      history.push(message);
      state.chatMessagesByRoom[message.roomId] = history;

      const room = state.chatRooms[message.roomId];
      if (room && !message.isRead && message.senderId !== get().user?.id) {
        room.unreadCount += 1;
      }
    }),

  setChatMessagesByRoom: (messages) =>
    set((state) => {
      for (const message of messages) {
        const history = state.chatMessagesByRoom[message.roomId] ?? [];
        if (!history.some((m) => m.id === message.id)) {
          history.push(message);
        }
        state.chatMessagesByRoom[message.roomId] = history;
      }
    }),

  clearChatMessages: (roomId) =>
    set((state) => {
      state.chatMessagesByRoom[roomId] = [];
      const room = state.chatRooms[roomId];
      if (room) room.unreadCount = 0;
    }),

  addChatInvite: (invite) =>
    set((state) => {
      if (!state.chatInvites.some((i) => i.roomId === invite.roomId && i.from === invite.from)) {
        state.chatInvites.push(invite);
      }
    }),

  removeChatInvite: (roomId, from) =>
    set((state) => {
      state.chatInvites = state.chatInvites.filter(
        (i) => !(i.roomId === roomId && i.from === from),
      );
    }),

  setSyncingChatRooms: (syncingChatRooms) =>
    set((state) => {
      state.syncingChatRooms = syncingChatRooms;
    }),
});
