import TcpSocket from 'react-native-tcp-socket';

import { PROTOCOL } from '../types/protocol';
import type {
  AuthCredentials,
  ConnectionState,
  DeviceFlags,
  InboundWireMessage,
  InboundChatMessage,
  ChatPresenceUpdate,
  ChatMessageType,
  MessageProtocol,
  Stanza,
} from '../types/protocol';
import { base64DecodeUtf8, saslPlainToken, utf8Decode } from './protobuf';

/**
 * `wsClient` — raw TCP transport for the legacy Uzzap IM protocol.
 *
 * RETIRED: the app backend is now Supabase (`supabaseClient.ts`). This module
 * is kept for reference and for its XML builders/parsers, which other modules
 * still import as pure functions. Nothing connects through it anymore.
 *
 * Despite the name this is **not** a WebSocket client: the legacy server
 * (`connect.kolipri.com`) only accepts plain TCP with a bespoke XML stream and
 * SASL PLAIN (see `PROTOCOL_SPEC.md`). `react-native-tcp-socket` provides the
 * native socket because React Native cannot open raw TCP from JS.
 *
 * Responsibilities:
 *  - host/port rotation across the hard-coded port list
 *  - the `idle → connecting → waiting → login → reinit → online` state machine
 *  - a hand-written, incremental XML stream parser producing the *flattened
 *    key model* (`iq/vcard/username`, `iq.type`, …) used by the J2ME engine
 *  - SASL PLAIN authentication + resource binding
 *  - assured-message ACK, retry (300 s / 3 attempts), keep-alive (900 s) and
 *    idle-state (300 s) timers
 *  - 15-entry inbound message-id de-duplication ring
 *  - reconnection with exponential backoff + host rotation
 */

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_HOSTS: readonly string[] = [PROTOCOL.DEFAULT_HOST];
const DEFAULT_PORTS: readonly number[] = [...PROTOCOL.PORTS];

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = PROTOCOL.POLL_INTERVAL_MS;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export interface PendingMessage {
  msgId: string;
  to: string;
  xml: string;
  tries: number;
  lastSentAt: number;
}

export type WsClientEvent =
  | { type: 'state'; state: ConnectionState }
  | { type: 'stanza'; stanza: Stanza }
  | { type: 'message'; message: InboundWireMessage }
  | { type: 'chat-message'; message: InboundChatMessage }
  | { type: 'chat-presence'; presence: ChatPresenceUpdate }
  | { type: 'ack'; messageId: string }
  | { type: 'message-failed'; pending: PendingMessage }
  | { type: 'roster'; stanza: Stanza }
  | { type: 'presence'; stanza: Stanza }
  | { type: 'connect'; host: string; port: number }
  | { type: 'auth-success'; mobile?: string }
  | { type: 'auth-failure'; code: string }
  | { type: 'error'; error: Error }
  | { type: 'disconnect'; reason?: string }
  | { type: 'log'; message: string };

export interface WsClientCallbacks {
  onConnect?: (host: string, port: number) => void;
  onAuthSuccess?: (mobile?: string) => void;
  onMessage?: (message: InboundWireMessage) => void;
  onChatMessage?: (message: InboundChatMessage) => void;
  onChatPresence?: (presence: ChatPresenceUpdate) => void;
  onPresence?: (stanza: Stanza) => void;
  onRoster?: (stanza: Stanza) => void;
  onError?: (error: Error) => void;
  onDisconnect?: (reason?: string) => void;
  onAck?: (messageId: string) => void;
  onMessageFailed?: (pending: PendingMessage) => void;
  onStanza?: (stanza: Stanza) => void;
  onStateChange?: (state: ConnectionState) => void;
  onFailure?: (code: string, detail?: string) => void;
}

export interface WsClientOptions {
  host?: string;
  hosts?: string[];
  ports?: number[];
  credentials?: AuthCredentials;
  device?: Partial<DeviceFlags>;
  timeoutMs?: number;
  keepAliveMs?: number;
  retryIntervalMs?: number;
  retryLimit?: number;
  idleIntervalMs?: number;
  autoReconnect?: boolean;
  maxReconnectDelayMs?: number;
  /** Some native builds emit base64 frames; decode each chunk when set. */
  assumeBase64Data?: boolean;
  callbacks?: WsClientCallbacks;
}

export interface ConnectOptions {
  authenticate?: boolean;
  credentials?: AuthCredentials;
  timeoutMs?: number;
}

export type WsClientListener = (event: WsClientEvent) => void;

/* -------------------------------------------------------------------------- */
/* XML helpers                                                                */
/* -------------------------------------------------------------------------- */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

/** Escape an embedded `]]>` so it cannot terminate a CDATA section. */
export function escapeCdata(value: string): string {
  return value.replace(/]]>/g, ']]]]><![CDATA[>');
}

export function cdata(value: string): string {
  return `<![CDATA[${escapeCdata(value)}]]>`;
}

export interface VCardData {
  username?: string;
  amazCid?: string;
  displayname?: string;
  phone?: string;
  email?: string;
  groups?: string[];
  pin?: string;
  extra?: Record<string, string>;
}

/** Serialise a `<vcard>` as used by registry / validation IQs. */
export function buildVCard(vcard: VCardData): string {
  const parts: string[] = ['<vcard>'];
  if (vcard.username !== undefined) parts.push(`<username>${escapeXml(vcard.username)}</username>`);
  if (vcard.amazCid !== undefined) parts.push(`<amaz-cid>${escapeXml(vcard.amazCid)}</amaz-cid>`);
  if (vcard.displayname !== undefined) {
    parts.push(`<displayname>${escapeXml(vcard.displayname)}</displayname>`);
  }
  if (vcard.phone !== undefined) parts.push(`<phone>${escapeXml(vcard.phone)}</phone>`);
  if (vcard.email !== undefined) parts.push(`<email>${escapeXml(vcard.email)}</email>`);
  if (vcard.groups && vcard.groups.length > 0) {
    parts.push(`<groups>${escapeXml(vcard.groups.join(','))}</groups>`);
  }
  if (vcard.pin !== undefined) parts.push(`<pin>${escapeXml(vcard.pin)}</pin>`);
  if (vcard.extra) {
    for (const [key, value] of Object.entries(vcard.extra)) {
      parts.push(`<${key}>${escapeXml(value)}</${key}>`);
    }
  }
  parts.push('</vcard>');
  return parts.join('');
}

export interface IqOptions {
  id: string;
  type: 'get' | 'set' | 'response' | 'error';
  action?: string;
  target?: string;
  amazProtocol?: string;
  method?: string;
  vcard?: VCardData;
  /** Raw child XML appended after `<action>` and `<vcard>`. */
  children?: string;
  attrs?: Record<string, string>;
}

/** Build a generic `<iq>` envelope with optional `<action>`/`<vcard>`. */
export function buildIq(options: IqOptions): string {
  const attrs: string[] = [`type='${options.type}'`, `id='${escapeXml(options.id)}'`];
  if (options.target) attrs.push(`to='${escapeXml(options.target)}'`);
  if (options.amazProtocol) attrs.push(`amaz-protocol='${escapeXml(options.amazProtocol)}'`);
  if (options.method) attrs.push(`method='${escapeXml(options.method)}'`);
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      attrs.push(`${key}='${escapeXml(value)}'`);
    }
  }

  const children: string[] = [];
  if (options.action) children.push(`<action name='${escapeXml(options.action)}'/>`);
  if (options.vcard) children.push(buildVCard(options.vcard));
  if (options.children) children.push(options.children);

  return `<iq ${attrs.join(' ')}>${children.join('')}</iq>`;
}

export interface OutboundMessageInput {
  to: string;
  body: string;
  msgId: string;
  protocol?: MessageProtocol;
  tries?: number;
  location?: string;
  buddyInvite?: boolean;
  recipient?: { username: string; displayname?: string };
  contact?: { username: string; displayname?: string };
}

/** Build an outbound `<message>` (spec §5.3). */
export function buildMessageXml(input: OutboundMessageInput): string {
  const protocol = input.protocol ?? 'im';
  const typeAttr = protocol === 'sms' || protocol === 'email' ? protocol : 'chat';
  const attrs: string[] = [
    `to='${escapeXml(input.to)}'`,
    `amaz-msg-id='${escapeXml(input.msgId)}'`,
    `amaz-retry='${input.tries ?? 0}'`,
    `type='${typeAttr}'`,
  ];
  if (input.location) attrs.push(`amaz-location='${escapeXml(input.location)}'`);
  if (protocol === 'sms' || protocol === 'email') {
    attrs.push(`amaz-protocol='${escapeXml(protocol)}'`);
  }
  if (input.buddyInvite) attrs.push(`amaz-buddy-invite='yes'`);

  const children: string[] = [`<body>${cdata(input.body)}</body>`];
  if (input.recipient) {
    const display = input.recipient.displayname ?? input.recipient.username;
    children.push(
      `<recipient username="${escapeXml(input.recipient.username)}" displayname="${escapeXml(
        display,
      )}"/>`,
    );
  }
  if (input.contact) {
    const display = input.contact.displayname ?? input.contact.username;
    children.push(
      `<contact username="${escapeXml(input.contact.username)}" displayname="${escapeXml(
        display,
      )}"/>`,
    );
  }
  return `<message ${attrs.join(' ')}>${children.join('')}</message>`;
}

let iqSequence = 0;

/** `<PREFIX>_<epochsec>_<seq>` id scheme (spec §5.2). */
export function newIqId(prefix: string): string {
  iqSequence += 1;
  return `${prefix}_${Math.floor(Date.now() / 1000)}_${iqSequence}`;
}

/* -------------------------------------------------------------------------- */
/* XML stream parser                                                          */
/* -------------------------------------------------------------------------- */

interface ParserFrame {
  name: string;
  path: string;
  text: string;
}

function stripNamespace(name: string): string {
  const index = name.lastIndexOf(':');
  return index === -1 ? name : name.slice(index + 1);
}

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(
    /&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g,
    (match: string, entity: string): string => {
      switch (entity) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        default: {
          if (entity.startsWith('#x') || entity.startsWith('#X')) {
            const code = Number.parseInt(entity.slice(2), 16);
            return Number.isNaN(code) ? match : String.fromCodePoint(code);
          }
          if (entity.startsWith('#')) {
            const code = Number.parseInt(entity.slice(1), 10);
            return Number.isNaN(code) ? match : String.fromCodePoint(code);
          }
          return match;
        }
      }
    },
  );
}

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = re.exec(input);
  while (match !== null) {
    const key = match[1];
    if (key) attrs[stripNamespace(key)] = decodeEntities(match[2] ?? match[3] ?? '');
    match = re.exec(input);
  }
  return attrs;
}

/**
 * Incremental, namespace-stripping XML stream parser.
 *
 * The root `stream` element is ignored (its close signals disconnect) so that
 * each direct child stanza is dispatched as soon as it closes, mirroring the
 * J2ME `kpr.g` → `kimp.ab` behaviour. Values are exposed through the flattened
 * key model plus an `arrays` map preserving repeated elements.
 */
export class XmlStreamParser {
  private buffer = '';
  private stack: ParserFrame[] = [];
  private keys: Record<string, string> = {};
  private arrays: Record<string, string[]> = {};

  /** Fired when the server's `<stream:stream>` header is seen. */
  onStreamOpen?: () => void;
  /** Fired when `</stream:stream>` is seen. */
  onStreamClose?: () => void;

  reset(): void {
    this.buffer = '';
    this.stack = [];
    this.keys = {};
    this.arrays = {};
  }

  push(chunk: string): Stanza[] {
    this.buffer += chunk;
    const out: Stanza[] = [];
    const buf = this.buffer;
    let i = 0;

    while (i < buf.length) {
      const lt = buf.indexOf('<', i);
      if (lt === -1) {
        this.handleText(buf.slice(i), false);
        i = buf.length;
        break;
      }
      if (lt > i) this.handleText(buf.slice(i, lt), false);
      i = lt;

      if (buf.startsWith('<!--', i)) {
        const end = buf.indexOf('-->', i + 4);
        if (end === -1) break;
        i = end + 3;
        continue;
      }
      if (buf.startsWith('<![CDATA[', i)) {
        const end = buf.indexOf(']]>', i + 9);
        if (end === -1) break;
        this.handleText(buf.slice(i + 9, end), true);
        i = end + 3;
        continue;
      }
      if (buf.startsWith('<?', i)) {
        const end = buf.indexOf('?>', i + 2);
        if (end === -1) break;
        i = end + 2;
        continue;
      }
      if (buf.startsWith('<!', i)) {
        const end = buf.indexOf('>', i + 2);
        if (end === -1) break;
        i = end + 1;
        continue;
      }

      const gt = buf.indexOf('>', i + 1);
      if (gt === -1) break; // incomplete tag — wait for the next chunk
      this.handleTag(buf.slice(i + 1, gt), out);
      i = gt + 1;
    }

    this.buffer = i >= buf.length ? '' : buf.slice(i);
    return out;
  }

  private handleTag(raw: string, out: Stanza[]): void {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;

    if (trimmed.startsWith('/')) {
      this.closeElement(stripNamespace(trimmed.slice(1).trim()), out);
      return;
    }

    const selfClosing = trimmed.endsWith('/');
    const body = selfClosing ? trimmed.slice(0, -1) : trimmed;
    const spaceIndex = body.search(/\s/);
    const rawName = spaceIndex === -1 ? body : body.slice(0, spaceIndex);
    const name = stripNamespace(rawName);
    const attrString = spaceIndex === -1 ? '' : body.slice(spaceIndex + 1);
    const attrs = parseAttributes(attrString);

    if (name === 'stream') {
      this.onStreamOpen?.();
      return;
    }

    const parent = this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
    const path = parent ? `${parent.path}/${name}` : name;
    if (!(path in this.keys)) this.keys[path] = '';

    for (const [key, value] of Object.entries(attrs)) {
      const attrPath = `${path}.${key}`;
      this.keys[attrPath] = value;
      this.pushArray(attrPath, value);
    }

    const frame: ParserFrame = { name, path, text: '' };
    if (selfClosing) {
      this.finishElement(frame, out);
    } else {
      this.stack.push(frame);
    }
  }

  private closeElement(name: string, out: Stanza[]): void {
    if (name === 'stream') {
      this.onStreamClose?.();
      return;
    }
    const frame = this.stack.pop();
    if (!frame) return; // stray close tag — ignore
    this.finishElement(frame, out);
  }

  private finishElement(frame: ParserFrame, out: Stanza[]): void {
    this.keys[frame.path] = frame.text;
    this.pushArray(frame.path, frame.text);

    if (this.stack.length === 0) {
      out.push({ tag: frame.name, keys: this.keys, arrays: this.arrays });
      this.keys = {};
      this.arrays = {};
    }
  }

  private handleText(text: string, isCdata: boolean): void {
    if (text.length === 0) return;
    const frame = this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
    if (!frame) return; // keep-alive / inter-stanza whitespace
    frame.text += isCdata ? text : decodeEntities(text);
  }

  private pushArray(key: string, value: string): void {
    const existing = this.arrays[key];
    if (existing) existing.push(value);
    else this.arrays[key] = [value];
  }
}

/* -------------------------------------------------------------------------- */
/* Socket adapter                                                             */
/* -------------------------------------------------------------------------- */

interface TcpSocketLike {
  on(event: 'data', listener: (data: string | Uint8Array | ArrayBuffer) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: (hadError?: boolean) => void): void;
  on(event: 'connect', listener: () => void): void;
  on(event: 'timeout', listener: () => void): void;
  write(data: string): boolean | void;
  destroy(): void;
  end(): void;
  setNoDelay?: (noDelay?: boolean) => void;
  setKeepAlive?: (enable?: boolean, initialDelay?: number) => void;
  setTimeout?: (timeout: number) => void;
  setEncoding?: (encoding: string) => void;
}

type CreateConnection = (options: Record<string, unknown>, callback?: () => void) => TcpSocketLike;

const createConnection = (TcpSocket as unknown as { createConnection: CreateConnection })
  .createConnection;

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

interface PendingRequest {
  predicate: (stanza: Stanza) => boolean;
  resolve: (stanza: Stanza) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : 'Unknown socket error');
}

function readFirst(keys: Record<string, string>, candidates: readonly string[]): string {
  for (const key of candidates) {
    const value = keys[key];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

export class WsClient {
  private hosts: string[] = [...DEFAULT_HOSTS];
  private ports: number[] = [...DEFAULT_PORTS];
  private credentials: AuthCredentials | null = null;
  private device: DeviceFlags = { model: 'react-native', heapKb: 0 };

  private timeoutMs = DEFAULT_TIMEOUT_MS;
  private keepAliveMs: number = PROTOCOL.KEEPALIVE_INTERVAL_MS;
  private retryIntervalMs: number = PROTOCOL.RETRY_INTERVAL_MS;
  private retryLimit: number = PROTOCOL.RETRY_LIMIT;
  private idleIntervalMs: number = PROTOCOL.IDLE_INTERVAL_MS;
  private maxReconnectDelayMs = RECONNECT_MAX_MS;

  private autoReconnect = true;
  private shouldReconnect = true;
  private hasBeenOnline = false;
  private authenticate = true;
  private assumeBase64Data = false;

  private connectionState: ConnectionState = 'idle';
  private hostIndex = 0;
  private portIndex = 0;
  private currentHost: string = PROTOCOL.DEFAULT_HOST;
  private currentPort = DEFAULT_PORTS[0] ?? 5222;

  private socket: TcpSocketLike | null = null;
  private alive = false;

  private readonly parser = new XmlStreamParser();
  private readonly listeners = new Set<WsClientListener>();
  private callbacks: WsClientCallbacks = {};
  private readonly pending = new Map<string, PendingMessage>();
  private readonly requests = new Set<PendingRequest>();

  private readonly seenMessageIds = new Set<string>();
  private readonly seenMessageOrder: string[] = [];

  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private lastSendAt = 0;
  private lastActivityAt = 0;
  private idleSent = false;

  constructor(options: WsClientOptions = {}) {
    this.parser.onStreamClose = () => this.finishDisconnect('stream-closed');
    this.configure(options);
  }

  /* ---------------------------------------------------------------------- */
  /* Configuration                                                          */
  /* ---------------------------------------------------------------------- */

  configure(options: WsClientOptions): void {
    if (options.hosts) this.hosts = [...options.hosts];
    else if (options.host) this.hosts = [options.host];

    if (options.ports) this.ports = [...options.ports];

    if (options.credentials) this.credentials = options.credentials;
    if (options.device) this.device = { ...this.device, ...options.device };
    if (options.timeoutMs !== undefined) this.timeoutMs = options.timeoutMs;
    if (options.keepAliveMs !== undefined) this.keepAliveMs = options.keepAliveMs;
    if (options.retryIntervalMs !== undefined) this.retryIntervalMs = options.retryIntervalMs;
    if (options.retryLimit !== undefined) this.retryLimit = options.retryLimit;
    if (options.idleIntervalMs !== undefined) this.idleIntervalMs = options.idleIntervalMs;
    if (options.autoReconnect !== undefined) this.autoReconnect = options.autoReconnect;
    if (options.maxReconnectDelayMs !== undefined) {
      this.maxReconnectDelayMs = options.maxReconnectDelayMs;
    }
    if (options.assumeBase64Data !== undefined) this.assumeBase64Data = options.assumeBase64Data;
    if (options.callbacks) this.setCallbacks(options.callbacks);
  }

  setCallbacks(callbacks: WsClientCallbacks): void {
    this.callbacks = callbacks;
  }

  setCredentials(credentials: AuthCredentials): void {
    this.credentials = credentials;
  }

  addListener(listener: WsClientListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.alive && this.socket !== null;
  }

  isOnline(): boolean {
    return this.connectionState === 'online';
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                              */
  /* ---------------------------------------------------------------------- */

  connect(options: ConnectOptions = {}): Promise<void> {
    if (options.credentials) this.credentials = options.credentials;
    if (options.authenticate !== undefined) this.authenticate = options.authenticate;

    if (this.connectionState === 'online') return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.shouldReconnect = true;
    this.hasBeenOnline = false;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const promise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
    });
    this.connectPromise = promise;

    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => this.onConnectTimeout(), timeoutMs);

    this.attemptConnection();
    return promise;
  }

  disconnect(reason = 'manual'): void {
    this.shouldReconnect = false;
    this.alive = false;
    this.clearTimers();
    this.failAllRequests(new Error('Disconnected'));
    this.pending.clear();
    this.cleanupSocket();

    const reject = this.connectReject;
    this.connectResolve = null;
    this.connectReject = null;
    this.connectPromise = null;
    reject?.(new Error(`Disconnected: ${reason}`));

    this.setState('idle');
    this.dispatch({ type: 'disconnect', reason });
  }

  private attemptConnection(): void {
    this.cleanupSocket();

    const host = this.hosts[this.hostIndex] ?? PROTOCOL.DEFAULT_HOST;
    const port = this.ports[this.portIndex] ?? this.currentPort;
    this.currentHost = host;
    this.currentPort = port;

    this.setState('connecting');
    this.dispatch({ type: 'log', message: `connecting ${host}:${port}` });

    try {
      const socket = createConnection({
        host,
        port,
        timeout: this.timeoutMs,
        reuseAddress: true,
        keepAlive: true,
      });
      this.socket = socket;
      this.bindSocketEvents(socket);
    } catch (error) {
      this.handleSocketError(toError(error));
    }
  }

  private bindSocketEvents(socket: TcpSocketLike): void {
    socket.on('connect', () => {
      if (this.socket !== socket) return;
      this.onSocketConnect();
    });

    socket.on('data', (data) => {
      if (this.socket !== socket) return;
      try {
        this.onSocketData(data);
      } catch (error) {
        this.handleSocketError(toError(error));
      }
    });

    socket.on('error', (error) => {
      if (this.socket !== socket) return;
      this.handleSocketError(toError(error));
    });

    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.finishDisconnect('closed');
    });

    socket.on('timeout', () => {
      if (this.socket !== socket) return;
      this.handleSocketError(new Error('Socket timeout'));
    });

    try {
      socket.setNoDelay?.(true);
      socket.setKeepAlive?.(true, 30_000);
      socket.setEncoding?.('utf8');
      socket.setTimeout?.(this.timeoutMs);
    } catch {
      // Non-fatal: the adapter may not support every optional method.
    }
  }

  private onSocketConnect(): void {
    this.alive = true;
    this.lastSendAt = Date.now();
    this.lastActivityAt = this.lastSendAt;
    this.setState('waiting');
    this.dispatch({ type: 'connect', host: this.currentHost, port: this.currentPort });

    try {
      this.socket?.setTimeout?.(0);
    } catch {
      // ignore
    }

    this.sendRaw(this.buildStreamOpen(false));
  }

  private onSocketData(data: string | Uint8Array | ArrayBuffer): void {
    const text = this.decodeData(data);
    const stanzas = this.parser.push(text);
    for (const stanza of stanzas) this.handleStanza(stanza);
  }

  private decodeData(data: string | Uint8Array | ArrayBuffer): string {
    if (typeof data === 'string') {
      if (this.assumeBase64Data) {
        try {
          return base64DecodeUtf8(data);
        } catch {
          return data;
        }
      }
      return data;
    }
    if (data instanceof Uint8Array) return utf8Decode(data);
    if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
      return utf8Decode(new Uint8Array(data));
    }
    return String(data);
  }

  /* ---------------------------------------------------------------------- */
  /* Handshake / stanza dispatch                                            */
  /* ---------------------------------------------------------------------- */

  private buildStreamOpen(postAuth: boolean): string {
    const attrs = [
      `to='${PROTOCOL.STREAM_TARGET}'`,
      `xmlns='${PROTOCOL.XML_NAMESPACE}'`,
      `version='1.0'`,
    ];
    if (postAuth) {
      attrs.push(`client-version='${PROTOCOL.CLIENT_VERSION}'`);
      attrs.push(`flags='model=${escapeXml(this.device.model)},heap=${this.device.heapKb}kb'`);
    }
    return `<stream ${attrs.join(' ')}>`;
  }

  private sendAuth(): void {
    const credentials = this.credentials;
    if (!credentials) {
      this.onAuthFailure('authentication-failed', 'No credentials configured');
      return;
    }
    const token = saslPlainToken(credentials.username, credentials.password);
    this.sendRaw(`<auth mechanism='PLAIN' xmlns='${PROTOCOL.SASL_NAMESPACE}'>${token}</auth>`);
  }

  private sendBind(): void {
    const id = newIqId('BIND');
    this.sendRaw(
      `<iq type='set' id='${id}'><bind xmlns='${PROTOCOL.BIND_NAMESPACE}'><resource>${PROTOCOL.RESOURCE}</resource></bind></iq>`,
    );
  }

  private sendAdminConfig(): void {
    this.sendRaw("<message to='admin'>configuration please</message>");
  }

  private handleStanza(stanza: Stanza): void {
    this.handleHandshake(stanza);

    if (stanza.tag === 'iq') this.handleIq(stanza);
    else if (stanza.tag === 'message') this.handleMessage(stanza);
    else if (stanza.tag === 'presence') this.dispatch({ type: 'presence', stanza });

    this.resolvePending(stanza);
    this.dispatch({ type: 'stanza', stanza });
  }

  private handleHandshake(stanza: Stanza): void {
    const tag = stanza.tag;

    if (tag === 'features' && this.connectionState === 'waiting') {
      if (this.authenticate) {
        this.setState('login');
        this.sendAuth();
      } else {
        this.setState('online');
        this.onReachedOnline(undefined);
      }
      return;
    }

    if (
      tag === 'success' &&
      (this.connectionState === 'login' || this.connectionState === 'waiting')
    ) {
      const mobile = stanza.keys['success.mobile'];
      this.setState('reinit');
      this.sendRaw(this.buildStreamOpen(true));
      this.sendBind();
      if (mobile) this.dispatch({ type: 'log', message: `mobile validated: ${mobile}` });
      return;
    }

    if (tag === 'failure') {
      const code = this.readFailureCode(stanza);
      this.onAuthFailure(code, 'SASL authentication failure');
      return;
    }

    if (
      tag === 'iq' &&
      this.connectionState === 'reinit' &&
      (stanza.keys['iq/bind/jid'] !== undefined ||
        stanza.keys['iq/bind/resource'] !== undefined ||
        stanza.keys['iq.type'] === 'result')
    ) {
      this.setState('online');
      this.onReachedOnline(undefined);
    }
  }

  private readFailureCode(stanza: Stanza): string {
    const keys = stanza.keys;
    if (keys['failure.not-validated'] !== undefined) return 'not-validated';
    if (keys['failure.temporary-auth-failure'] !== undefined) {
      return 'temporary-auth-failure';
    }
    if (keys['failure.invalid-apn'] !== undefined) return 'invalid-apn';
    if (keys['failure.invalid-credentials'] !== undefined) {
      return 'invalid-credentials';
    }
    return keys['failure.amaz-error'] ?? 'authentication-failed';
  }

  private onReachedOnline(mobile: string | undefined): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.hasBeenOnline = true;
    this.reconnectAttempts = 0;
    this.startTimers();

    this.dispatch({ type: 'auth-success', mobile });
    this.callbacks.onAuthSuccess?.(mobile);

    const resolve = this.connectResolve;
    this.connectResolve = null;
    this.connectReject = null;
    this.connectPromise = null;
    resolve?.();

    // Post-online bootstrap (spec §4/§12.1).
    this.sendAdminConfig();
    this.sendRosterQuery();
    this.sendPrivateQuery();
  }

  private onAuthFailure(code: string, detail: string): void {
    this.shouldReconnect = false;
    this.clearTimers();
    const error = new Error(`Authentication failed: ${code}`);
    this.dispatch({ type: 'auth-failure', code });
    this.callbacks.onFailure?.(code, detail);

    const reject = this.connectReject;
    this.connectResolve = null;
    this.connectReject = null;
    this.connectPromise = null;
    reject?.(error);

    this.setState('failed-connect');
    this.dispatch({ type: 'error', error });
    this.cleanupSocket();
  }

  private onConnectTimeout(): void {
    this.connectTimer = null;
    const reject = this.connectReject;
    this.connectResolve = null;
    this.connectReject = null;
    this.connectPromise = null;
    this.failAllRequests(new Error('Connection timed out'));
    this.setState('failed-connect');
    this.cleanupSocket();
    reject?.(new Error('Connection timed out'));
  }

  /* ---------------------------------------------------------------------- */
  /* IQ / message handling                                                  */
  /* ---------------------------------------------------------------------- */

  private handleIq(stanza: Stanza): void {
    const keys = stanza.keys;

    if (keys['iq.protocol'] === 'amaz-msg-ack') {
      const messageId = keys['iq.amaz-msg-id'];
      if (messageId) {
        this.pending.delete(messageId);
        this.dispatch({ type: 'ack', messageId });
        this.callbacks.onAck?.(messageId);
      }
      return;
    }

    const actionName = keys['iq/action.name'];

    if (actionName === 'query-roster') {
      this.dispatch({ type: 'roster', stanza });
      this.callbacks.onRoster?.(stanza);
      return;
    }

    if (actionName === 'chatuser') {
      const roomId = keys['iq/vcard/username'] ?? keys['iq/chatuser.room'];
      const nick = keys['iq/chatuser.nick'] ?? keys['iq/vcard/displayname'];
      const type = keys['iq/chatuser.type'] ?? 'available';
      const role = keys['iq/chatuser.role'] as 'moderator' | 'participant' | 'visitor' | undefined;
      const initial = keys['iq/chatuser.initial'] === 'yes';
      const fromJid = keys['iq/chatuser.from'] ?? keys['iq/from'];
      const userId = fromJid?.split('/')[0] ?? roomId ?? 'unknown';

      if (roomId && nick) {
        const presence: ChatPresenceUpdate = {
          roomId,
          userId,
          nick,
          type: type === 'unavailable' ? 'unavailable' : 'available',
          role,
          initial,
        };
        this.dispatch({ type: 'chat-presence', presence });
        this.callbacks.onChatPresence?.(presence);
      }
      return;
    }

    if (this.isPresenceAction(actionName, keys)) {
      this.dispatch({ type: 'presence', stanza });
      return;
    }

    const error = keys['iq/error.amaz-error'];
    if (error) {
      this.callbacks.onFailure?.(error);
      this.dispatch({
        type: 'error',
        error: new Error(`IQ error: ${error} (action=${actionName ?? 'unknown'})`),
      });
    }
  }

  private isPresenceAction(actionName: string | undefined, keys: Record<string, string>): boolean {
    if (!actionName) return false;
    if (
      actionName === 'query-profile' ||
      actionName === 'save-profile' ||
      actionName === 'profile-update' ||
      actionName === 'update-idle-state'
    ) {
      return (
        keys['iq/vcard/username'] !== undefined ||
        actionName === 'profile-update' ||
        actionName === 'update-idle-state'
      );
    }
    return false;
  }

  private handleMessage(stanza: Stanza): void {
    const messageId = stanza.keys['message.amaz-msg-id'] ?? '';

    // 15-entry dedup ring — never ACK or surface the same id twice.
    if (messageId) {
      if (this.seenMessageIds.has(messageId)) return;
      this.rememberMessageId(messageId);
    }

    const from = readFirst(stanza.keys, [
      'message.amaz-from',
      'message.sms-from',
      'message.from',
      'message.amaz-abm-from',
      'message/email.from',
    ]);

    const timestampRaw = readFirst(stanza.keys, ['message.ts', 'message/timestamp']);
    const timestampNumber = Number(timestampRaw);
    const timestamp =
      Number.isFinite(timestampNumber) && timestampNumber > 0
        ? timestampNumber
        : Math.floor(Date.now() / 1000);

    const protocol = (stanza.keys['message.amaz-protocol'] ?? 'im') as MessageProtocol;
    const retriesRaw = readFirst(stanza.keys, ['tries', 'message.amaz-retry']);
    const retriesNumber = Number(retriesRaw);

    const recipients = stanza.arrays['message/recipient.username'] ?? [];
    const contactUsernames = stanza.arrays['message/contact.username'] ?? [];
    const contactDisplayNames = stanza.arrays['message/contact.displayname'] ?? [];

    // Check if this is a chat protocol message
    if (protocol === 'chat') {
      const chatMessage: InboundChatMessage = {
        roomId: stanza.keys['message/msg.room'] ?? stanza.keys['message.to'] ?? '',
        from,
        nick: stanza.keys['message/msg.from'] ?? stanza.keys['message.amaz-display-name'] ?? from,
        body: stanza.keys['message/body'] ?? '',
        timestamp,
        msgId: messageId,
        type: (stanza.keys['message/msg.type'] as ChatMessageType) ?? 'groupchat',
        recipient: stanza.keys['message/recipient.username'],
        isInvite: 'message.amaz-buddy-invite' in stanza.keys,
      };

      if (messageId && from) this.sendAck(messageId, from);
      this.lastActivityAt = Date.now();
      this.dispatch({ type: 'chat-message', message: chatMessage });
      this.callbacks.onChatMessage?.(chatMessage);
      return;
    }

    const inbound: InboundWireMessage = {
      from,
      displayName: stanza.keys['message.amaz-display-name'] ?? from,
      to: (stanza.keys['message.to'] ?? '').split('@')[0] ?? '',
      body: stanza.keys['message/body'] ?? '',
      timestamp,
      protocol,
      msgId: messageId,
      location: stanza.keys['message.amaz-location'],
      retries: Number.isFinite(retriesNumber) ? retriesNumber : 0,
      isBuddyInvite: 'message.amaz-buddy-invite' in stanza.keys,
      isAbmFrom: 'message.amaz-abm-from' in stanza.keys,
      isSmsInvite: 'message.amaz-sms-invite' in stanza.keys,
      recipients,
      contacts: contactUsernames.map((username, index) => ({
        username,
        displayname: contactDisplayNames[index],
      })),
    };

    // ACK every inbound assured message (spec §10.1).
    if (messageId && from) this.sendAck(messageId, from);

    this.lastActivityAt = Date.now();
    this.dispatch({ type: 'message', message: inbound });
    this.callbacks.onMessage?.(inbound);
  }

  private rememberMessageId(messageId: string): void {
    this.seenMessageIds.add(messageId);
    this.seenMessageOrder.push(messageId);
    while (this.seenMessageOrder.length > PROTOCOL.ACK_RING_SIZE) {
      const oldest = this.seenMessageOrder.shift();
      if (oldest) this.seenMessageIds.delete(oldest);
    }
  }

  private dispatch(event: WsClientEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A misbehaving listener must not break the transport.
      }
    }

    const cb = this.callbacks;
    switch (event.type) {
      case 'connect':
        cb.onConnect?.(event.host, event.port);
        break;
      case 'auth-success':
        break; // invoked directly in onReachedOnline
      case 'message':
        break; // invoked directly in handleMessage
      case 'chat-message':
        break; // invoked directly in handleMessage
      case 'chat-presence':
        break; // invoked directly in handleIq
      case 'presence':
        cb.onPresence?.(event.stanza);
        break;
      case 'roster':
        cb.onRoster?.(event.stanza);
        break;
      case 'message-failed':
        cb.onMessageFailed?.(event.pending);
        break;
      case 'error':
        cb.onError?.(event.error);
        break;
      case 'disconnect':
        cb.onDisconnect?.(event.reason);
        break;
      case 'state':
        cb.onStateChange?.(event.state);
        break;
      default:
        break;
    }
  }

  private setState(state: ConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    for (const listener of this.listeners) {
      try {
        listener({ type: 'state', state });
      } catch {
        // ignore
      }
    }
    this.callbacks.onStateChange?.(state);
  }

  /* ---------------------------------------------------------------------- */
  /* Outbound                                                               */
  /* ---------------------------------------------------------------------- */

  private sendRaw(data: string): void {
    const socket = this.socket;
    if (!socket) throw new Error('Socket is not connected');
    socket.write(data);
    this.lastSendAt = Date.now();
    this.lastActivityAt = this.lastSendAt;
    if (this.idleSent) {
      this.idleSent = false;
      this.sendIdleState(false);
    }
  }

  private sendKeepAlive(): void {
    const socket = this.socket;
    if (!socket) return;
    socket.write(PROTOCOL.KEEPALIVE_BYTE);
    this.lastSendAt = Date.now();
  }

  /** Write an already-built stanza (handshake bytes included). */
  write(data: string): void {
    this.sendRaw(data);
  }

  sendIq(xml: string): void {
    this.sendRaw(xml);
  }

  sendAck(messageId: string, to: string): void {
    this.sendRaw(
      `<iq to='${escapeXml(to)}' type='set' protocol='amaz-msg-ack' amaz-msg-id='${escapeXml(
        messageId,
      )}' />`,
    );
  }

  sendIdleState(isIdle: boolean): void {
    const state = isIdle ? 'idle' : 'not-idle';
    const id = newIqId('REG');
    this.sendRaw(
      `<iq type='set' id='${id}' to='registry' amaz-protocol='registry'><action name='update-idle-state'><state>${state}</state></action></iq>`,
    );
  }

  sendRosterQuery(): void {
    const id = newIqId('REG');
    this.sendRaw(
      `<iq type='get' id='${id}' to='registry' amaz-protocol='registry'><action name='query-roster'/></iq>`,
    );
  }

  private sendPrivateQuery(): void {
    const id = newIqId('REG');
    this.sendRaw(
      `<iq type='get' id='${id}' to='registry' amaz-protocol='registry'><action name='query-private'/></iq>`,
    );
  }

  /**
   * Queue, assign an `amaz-msg-id` (the local id is reused) and send a message.
   * The entry stays in the pending list until an ACK removes it.
   */
  sendMessage(input: OutboundMessageInput): PendingMessage {
    const xml = buildMessageXml({ ...input, tries: input.tries ?? 0 });
    const pending: PendingMessage = {
      msgId: input.msgId,
      to: input.to,
      xml,
      tries: input.tries ?? 0,
      lastSentAt: Date.now(),
    };
    this.pending.set(pending.msgId, pending);
    this.sendRaw(xml);
    return pending;
  }

  sendIqAndWait(
    xml: string,
    predicate: (stanza: Stanza) => boolean,
    timeoutMs = 15_000,
  ): Promise<Stanza> {
    return new Promise<Stanza>((resolve, reject) => {
      const request: PendingRequest = {
        predicate,
        resolve: (stanza) => {
          this.requests.delete(request);
          clearTimeout(request.timer);
          resolve(stanza);
        },
        reject: (error) => {
          this.requests.delete(request);
          clearTimeout(request.timer);
          reject(error);
        },
        timer: setTimeout(() => {
          this.requests.delete(request);
          reject(new Error('IQ request timed out'));
        }, timeoutMs),
      };
      this.requests.add(request);
      try {
        this.sendRaw(xml);
      } catch (error) {
        request.reject(toError(error));
      }
    });
  }

  private resolvePending(stanza: Stanza): void {
    for (const request of [...this.requests]) {
      if (request.predicate(stanza)) request.resolve(stanza);
    }
  }

  private failAllRequests(error: Error): void {
    for (const request of [...this.requests]) request.reject(error);
    this.requests.clear();
  }

  /* ---------------------------------------------------------------------- */
  /* Timers                                                                 */
  /* ---------------------------------------------------------------------- */

  private startTimers(): void {
    this.stopTimers();
    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
  }

  private stopTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopTimers();
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private tick(): void {
    if (!this.socket || (this.connectionState !== 'online' && this.connectionState !== 'reinit')) {
      return;
    }
    const now = Date.now();

    // Keep-alive: a single space after 900 s of idle (spec §10.3).
    if (now - this.lastSendAt >= this.keepAliveMs) this.sendKeepAlive();

    // Idle announcement: update-idle-state idle after 300 s (spec §10.4).
    if (now - this.lastActivityAt >= this.idleIntervalMs) {
      if (!this.idleSent) {
        this.idleSent = true;
        this.sendIdleState(true);
      }
    }

    // Retry unacked messages: every 300 s, max 3 attempts (spec §10.2).
    for (const entry of [...this.pending.values()]) {
      if (now - entry.lastSentAt < this.retryIntervalMs) continue;
      entry.tries += 1;
      if (entry.tries <= this.retryLimit) {
        entry.lastSentAt = now;
        entry.xml = entry.xml.replace(/amaz-retry='\d+'/, `amaz-retry='${entry.tries}'`);
        try {
          this.sendRaw(entry.xml);
        } catch (error) {
          this.dispatch({ type: 'error', error: toError(error) });
        }
      } else {
        this.pending.delete(entry.msgId);
        this.dispatch({ type: 'message-failed', pending: entry });
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Disconnect / reconnect                                                 */
  /* ---------------------------------------------------------------------- */

  private handleSocketError(error: Error): void {
    this.dispatch({ type: 'error', error });
    this.callbacks.onError?.(error);
    if (this.alive) {
      this.finishDisconnect(error.message);
    } else if (this.connectReject) {
      const reject = this.connectReject;
      this.connectResolve = null;
      this.connectReject = null;
      this.connectPromise = null;
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.setState('failed-connect');
      this.cleanupSocket();
      reject(error);
    }
  }

  private finishDisconnect(reason: string): void {
    if (!this.alive && this.connectionState === 'idle') return;
    const wasAlive = this.alive;
    this.alive = false;
    this.clearTimers();
    this.failAllRequests(new Error(`Connection ${reason}`));
    this.cleanupSocket();

    if (this.connectReject) {
      const reject = this.connectReject;
      this.connectResolve = null;
      this.connectReject = null;
      this.connectPromise = null;
      reject(new Error(`Connection ${reason}`));
    }

    this.setState('disconnected');
    this.dispatch({ type: 'disconnect', reason });

    if (this.autoReconnect && this.shouldReconnect && (wasAlive || this.hasBeenOnline)) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    const attempt = this.reconnectAttempts;
    this.reconnectAttempts += 1;
    const backoff = Math.min(this.maxReconnectDelayMs, RECONNECT_BASE_MS * 2 ** attempt);
    const delay = backoff + Math.floor(Math.random() * 1_000);
    this.dispatch({ type: 'log', message: `reconnecting in ${delay}ms (attempt ${attempt + 1})` });

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnecting = false;
      if (!this.shouldReconnect) return;
      this.rotateEndpoint();
      this.attemptConnection();
    }, delay);
  }

  private rotateEndpoint(): void {
    this.portIndex += 1;
    if (this.portIndex >= this.ports.length) {
      this.portIndex = 0;
      if (this.hosts.length > 0) this.hostIndex = (this.hostIndex + 1) % this.hosts.length;
    }
  }

  private cleanupSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    try {
      socket.destroy();
    } catch {
      // ignore
    }
  }
}

/** Shared, application-wide client instance. */
export const wsClient = new WsClient({
  hosts: [...DEFAULT_HOSTS],
  ports: [...DEFAULT_PORTS],
});
