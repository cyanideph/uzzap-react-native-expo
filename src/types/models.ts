import type { MessageProtocol, PresenceStatus, ChatRoomType, ChatMessageType } from './protocol';

export type MessageType = 'text' | 'sms' | 'esms' | 'contact' | 'system' | 'image' | 'location';

export type MessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type OfflineDeliveryMode = 'sms' | 'email' | 'server' | 'push';

export type ThemeId = 'default' | 'uzzap' | 'custom';

export interface User {
  userId: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: number;
  lastLogin: number;
  mobileValidated: boolean;
}

export interface Buddy {
  userId: string;
  displayName: string;
  phoneNumber?: string;
  status: PresenceStatus;
  statusMessage?: string;
  isBlocked: boolean;
  isUzzapUser: boolean;
  lastSeen?: number;
  avatar?: string;
  groups: string[];
  /** Server-side contact id (`amaz-cid`). */
  amazCid?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  type: MessageType;
  protocol: MessageProtocol;
  content: string;
  timestamp: number;
  status: MessageStatus;
  receiptRequested: boolean;
  offlineQueued: boolean;
  isRead: boolean;
  /** Server-assigned `amaz-msg-id`. */
  amazMsgId?: string;
  retryCount: number;
  sentAt?: number;
  deliveredAt?: number;
  readAt?: number;
  /** JSON blob for vCard / location / attachment metadata. */
  meta?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  buddyId: string;
  lastMessageId?: string;
  unreadCount: number;
  isPinned: boolean;
  draftText?: string;
  updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Chat Room types                                                            */
/* -------------------------------------------------------------------------- */

export interface ChatRoom {
  id: string;
  name: string;
  type: ChatRoomType;
  maxUsers: number;
  passwordProtected: boolean;
  creatorId?: string;
  createdAt: number;
  lastActiveAt?: number;
  isJoined: boolean;
  myNick?: string;
  unreadCount: number;
}

export interface ChatRoomUser {
  userId: string;
  roomId: string;
  nick: string;
  role: 'moderator' | 'participant' | 'visitor';
  status: PresenceStatus;
  isSelf: boolean;
  joinedAt: number;
  lastSeen?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderNick: string;
  type: ChatMessageType;
  content: string;
  timestamp: number;
  recipientId?: string; // for privatechat
  amazMsgId?: string;
  isRead: boolean;
  status: MessageStatus;
}

export interface CreateRoomInput {
  name: string;
  type: ChatRoomType;
  password?: string;
  maxUsers?: number;
  nick: string;
}

export interface ChatInvite {
  roomId: string;
  from: string;
  body: string;
  timestamp: number;
}

export interface AppSettings {
  autoStart: boolean;
  autoLogin: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  soundUri: string;
  ledEnabled: boolean;
  theme: ThemeId;
  darkMode: 'light' | 'dark' | 'system';
  offlineDelivery: OfflineDeliveryMode;
  readReceipts: boolean;
  lastSeenVisible: boolean;
  connectionTimeout: number;
  keepAliveInterval: number;
  proxyEnabled: boolean;
  proxyHost: string;
  proxyPort: number;
  biometricUnlock: boolean;
  hasSeenIntro: boolean;
  smsFallback: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoStart: false,
  autoLogin: false,
  vibrationEnabled: true,
  soundEnabled: true,
  soundUri: 'default',
  ledEnabled: false,
  theme: 'uzzap',
  darkMode: 'system',
  offlineDelivery: 'server',
  readReceipts: true,
  lastSeenVisible: true,
  connectionTimeout: 60,
  keepAliveInterval: 900,
  proxyEnabled: false,
  proxyHost: '',
  proxyPort: 0,
  biometricUnlock: false,
  hasSeenIntro: false,
  smsFallback: true,
};

export type AuthPhase = 'unknown' | 'unauthenticated' | 'needs-pin' | 'authenticated' | 'locked';

export interface AuthSession {
  userId: string;
  username: string;
  displayName: string;
  token?: string;
  phase: AuthPhase;
  mobileMasked?: string;
  issuedAt: number;
}
