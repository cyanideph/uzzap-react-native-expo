/**
 * Wire-protocol types derived from `PROTOCOL_SPEC.md`.
 *
 * The legacy Uzzap server speaks a custom XML stream over a raw TCP socket
 * (not standard XMPP): SASL PLAIN only, namespace prefixes stripped, stanzas
 * flattened into `path`/`path.attr` keys. These types mirror that model.
 */

/* -------------------------------------------------------------------------- */
/* Constants (spec §2)                                                        */
/* -------------------------------------------------------------------------- */

export const PROTOCOL = {
  /** Default IM host. */
  DEFAULT_HOST: 'connect.kolipri.com',
  /** Host list RMS key. */
  HOST_LIST_KEY: 'kolipri.xmpp.host_list',
  /** Host-index RMS key (note the original typo `xmmp`). */
  HOST_INDEX_KEY: 'kolipri.xmmp.host.index',
  /** Hard-coded port rotation attempted in order. */
  PORTS: [5222, 8734, 10873, 40932, 80, 25, 20, 21, 110, 443, 465] as const,
  /** Stream `to` target. */
  STREAM_TARGET: 'amazilia',
  XML_NAMESPACE: 'jabber:client',
  CLIENT_VERSION: 'kalyptej-1.0.14',
  /** Post-auth resource. */
  RESOURCE: 'kalyptej',
  SASL_NAMESPACE: 'urn:ietf:params:xml:ns:xmpp-sasl',
  BIND_NAMESPACE: 'urn:ietf:params:xml:ns:xmpp-bind',
  /** Keep-alive payload (a single space). */
  KEEPALIVE_BYTE: ' ',
  /** Engine timing defaults (spec §2.1). */
  RETRY_INTERVAL_MS: 300_000,
  RETRY_LIMIT: 3,
  KEEPALIVE_INTERVAL_MS: 900_000,
  IDLE_INTERVAL_MS: 300_000,
  ROOM_CACHE_INTERVAL_MS: 60_000,
  /** Non-blocking read poll interval used by the J2ME engine. */
  POLL_INTERVAL_MS: 1_000,
  /** Ring-buffer size for inbound message-id de-duplication. */
  ACK_RING_SIZE: 15,
  /** SMS validation listener port. */
  SMS_PORT: 50000,
  /** SMS validation PIN prefix. */
  SMS_PIN_PREFIX: 'Validation PIN: ',
} as const;

/** IQ `to` targets (spec §2). */
export const IQ_TARGETS = {
  registry: 'registry',
  registryAlt: '___registry___',
  validation: 'validation',
  accounts: 'accounts',
  subscription: 'subscription',
  admin: 'admin',
  conference: 'conference',
} as const;

export type IqTarget = (typeof IQ_TARGETS)[keyof typeof IQ_TARGETS] | string;

/** `amaz-protocol` values. */
export type AmazProtocol =
  'registry' | 'validation' | 'accounts' | 'subscription' | 'chat' | 'sms' | 'email' | 'im';

/** Registry / billing / chat action names (spec §7, §9). */
export type RegistryAction =
  | 'query-roster'
  | 'save-contact'
  | 'delete-contact'
  | 'query-profile'
  | 'save-profile'
  | 'query-private'
  | 'save-private'
  | 'init-store-contact'
  | 'store-contact'
  | 'change-password'
  | 'rename-group'
  | 'pre-register'
  | 'register'
  | 'validation'
  | 'update-idle-state'
  | 'subscribe'
  | 'list'
  | 'inquire-history'
  | 'inquire-status'
  | 'cancel-auto-renew'
  | 'set-auto-renew'
  | 'confirmation'
  | 'pin-request'
  | 'password-reset'
  | 'login'
  | 'logout'
  | 'status-update';

/** Chat room action names (spec §9). */
export type ChatRoomAction =
  | 'query-ug'
  | 'query-groups'
  | 'query-group'
  | 'chatuser'
  | 'create-room'
  | 'invite'
  | 'leave'
  | 'whisper'
  | 'msg';

/** Chat room types. */
export type ChatRoomType = 'private' | 'generated' | 'system';

/** Chat room message types. */
export type ChatMessageType = 'groupchat' | 'privatechat' | 'invite';

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

/** Wire `amaz-protocol` message type (spec §6). */
export type MessageProtocol =
  'im' | 'chat' | 'sms' | 'smsr' | 'em' | 'email' | 'random' | 'yahoo' | 'msn';

/** Presence show values (spec §6). */
export type PresenceStatus = 'online' | 'available' | 'away' | 'busy' | 'invisible' | 'offline';

/** Buddy group set (spec §6). */
export type BuddyGroup =
  'chatterbox' | 'buddies' | 'most_frequent' | 'action_required' | 'other_contacts';

/** Engine state machine (spec §4). */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'waiting'
  | 'login'
  | 'reinit'
  | 'online'
  | 'sleeping'
  | 'awake'
  | 'disabled'
  | 'failed-connect'
  | 'disconnected';

/* -------------------------------------------------------------------------- */
/* Chat Room types (spec §9)                                                   */
/* -------------------------------------------------------------------------- */

export interface ChatRoom {
  id: string;
  name: string;
  type: ChatRoomType;
  maxUsers: number;
  passwordProtected: boolean;
  creatorId?: string;
  createdAt: number;
}

export interface ChatRoomGroup {
  name: string;
  rooms: ChatRoom[];
}

export interface ChatUser {
  userId: string;
  nick: string;
  roomId: string;
  role: 'moderator' | 'participant' | 'visitor';
  status: PresenceStatus;
  initial?: boolean;
}

export interface ChatInvite {
  roomId: string;
  from: string;
  body: string;
  timestamp: number;
}

export interface CreateRoomInput {
  name: string;
  type: ChatRoomType;
  password?: string;
  maxUsers?: number;
  nick: string;
}

/* -------------------------------------------------------------------------- */
/* Flattened stanza model (spec §3.2)                                         */
/* -------------------------------------------------------------------------- */

/**
 * A completed inbound root element flattened into `path` and `path.attr` keys.
 * Example: `<iq type='response' id='x'><action name='query-roster'/></iq>`
 *   -> { tag: 'iq', keys: { 'iq': '', 'iq.type': 'response',
 *                           'iq.id': 'x', 'iq/action': '',
 *                           'iq/action.name': 'query-roster' } }
 */
export interface Stanza {
  tag: string;
  keys: Record<string, string>;
  /** Repeated elements preserve each occurrence here. */
  arrays: Record<string, string[]>;
}

export interface ParsedIq extends Stanza {
  tag: 'iq' | string;
}

/* -------------------------------------------------------------------------- */
/* Error codes (spec §13)                                                     */
/* -------------------------------------------------------------------------- */

export type AmazErrorCode =
  // validation
  | 'invalid-mobile'
  | 'duplicate-mobile'
  | 'invalid-parameters'
  | 'database-error'
  // register
  | 'duplicate-username'
  | 'invalid-username'
  | 'empty-username'
  | 'empty-password'
  | 'empty-mobile'
  | 'failed-to-create'
  | 'register-invalid-pin'
  // gateway
  | 'authentication-failed'
  | 'connection-failed'
  | 'connection-lost'
  | 'on-maintenance'
  | 'unknown-error'
  // PIN
  | 'code-not-found'
  | 'validation-code-not-sent'
  | '404'
  // password reset
  | 'no-email'
  // subscription
  | 'invalid-package'
  | 'not-active'
  | 'insufficient-credits'
  | 'not-available'
  | 'on-free-trial'
  | 'no-subscription'
  | 'out-of-network'
  // billing
  | 'no-history'
  // chat
  | 'room-full'
  | 'join-failed'
  | 'not-authorized'
  | 'duplicate-nick'
  | 'duplicate-jid'
  | 'duplicate-room'
  | 'ug-not-available'
  | 'max-ug-rooms'
  | 'max-sys-ug-rooms'
  | 'name-len-error-short'
  | 'name-len-error-long'
  | 'no-rooms-found';

/* -------------------------------------------------------------------------- */
/* Transport config                                                           */
/* -------------------------------------------------------------------------- */

export interface SocketConfig {
  host: string;
  port: number;
  /** Connect + handshake timeout in ms. */
  timeoutMs: number;
  keepAliveMs: number;
  retryIntervalMs: number;
  retryLimit: number;
  idleIntervalMs: number;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface DeviceFlags {
  model: string;
  heapKb: number;
}

/* -------------------------------------------------------------------------- */
/* Engine events                                                              */
/* -------------------------------------------------------------------------- */

export type WsClientEvent =
  | { type: 'state'; state: ConnectionState }
  | { type: 'stanza'; stanza: Stanza }
  | { type: 'message'; message: InboundWireMessage }
  | { type: 'ack'; messageId: string }
  | { type: 'failure'; code: AmazErrorCode | 'unknown-error'; detail?: string }
  | { type: 'raw'; data: string }
  | { type: 'error'; error: Error }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string };

/** Inbound `<message>` mapped per spec §5.4. */
export interface InboundWireMessage {
  from: string;
  displayName: string;
  to: string;
  body: string;
  timestamp: number;
  protocol: MessageProtocol;
  msgId: string;
  location?: string;
  retries: number;
  isBuddyInvite: boolean;
  isAbmFrom: boolean;
  isSmsInvite: boolean;
  recipients: string[];
  contacts: { username: string; displayname?: string }[];
}

/** Inbound chat room message (spec §9). */
export interface InboundChatMessage {
  roomId: string;
  from: string;
  nick: string;
  body: string;
  timestamp: number;
  msgId: string;
  type: ChatMessageType;
  recipient?: string; // for privatechat
  isInvite: boolean;
}

/** Chat room presence update. */
export interface ChatPresenceUpdate {
  roomId: string;
  userId: string;
  nick: string;
  type: 'available' | 'unavailable';
  role?: 'moderator' | 'participant' | 'visitor';
  initial?: boolean;
}

/** Outbound `<message>` builder input (spec §5.3). */
export interface OutboundWireMessage {
  to: string;
  body: string;
  protocol?: MessageProtocol;
  msgId?: string;
  location?: string;
  displayName?: string;
  buddyInvite?: boolean;
}

/** Outbound chat room message (spec §9). */
export interface OutboundChatMessage {
  roomId: string;
  body: string;
  msgId?: string;
  type?: ChatMessageType;
  recipient?: string; // for whisper
}
