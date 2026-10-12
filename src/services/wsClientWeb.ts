import { PROTOCOL } from '../types/protocol';
import type {
  AuthCredentials,
  ConnectionState,
  DeviceFlags,
  InboundWireMessage,
  InboundChatMessage,
  ChatPresenceUpdate,
  MessageProtocol,
  Stanza,
  WsClientEvent,
} from '../types/protocol';
import type {
  WsClientCallbacks,
  WsClientOptions,
  ConnectOptions,
  PendingMessage,
  OutboundMessageInput,
} from './wsClient';
import { escapeXml, newIqId, buildMessageXml } from './wsClient';
import { saslPlainToken, utf8Decode } from './protobuf';

/**
 * WebSocket transport for the Uzzap protocol.
 *
 * RETIRED: the app backend is now Supabase (`supabaseClient.ts` + Realtime).
 * Kept for reference only; nothing connects through it anymore.
 */

const DEFAULT_WS_HOST = 'wss://connect.kolipri.com:5280';
const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = PROTOCOL.POLL_INTERVAL_MS;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

export interface WsClientWebOptions extends WsClientOptions {
  wsUrl?: string;
  wsProtocols?: string[];
}

export type WsClientWebEvent = WsClientEvent | { type: 'message-failed'; pending: PendingMessage } | { type: 'disconnect'; reason?: string } | { type: 'connect'; host: string; port: number } | { type: 'auth-success'; mobile?: string } | { type: 'auth-failure'; code: string } | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string } | { type: 'roster'; stanza: Stanza } | { type: 'chat-presence'; presence: ChatPresenceUpdate } | { type: 'chat-message'; message: InboundChatMessage };

export type WsClientWebListener = (event: WsClientWebEvent) => void;

export class WsClientWeb {
  private wsUrl: string = DEFAULT_WS_HOST;
  private credentials: AuthCredentials | null = null;
  private device: DeviceFlags = { model: 'web', heapKb: 0 };

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

  private connectionState: ConnectionState = 'idle';
  private ws: WebSocket | null = null;
  private alive = false;

  private readonly parser = new WebXmlStreamParser();
  private readonly listeners = new Set<WsClientWebListener>();
  private callbacks: WsClientCallbacks = {};
  private readonly pending = new Map<string, PendingMessage>();

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

  constructor(options: WsClientWebOptions = {}) {
    this.parser.onStreamClose = () => this.finishDisconnect('stream-closed');
    this.configure(options);
  }

  configure(options: WsClientWebOptions): void {
    if (options.wsUrl) this.wsUrl = options.wsUrl;
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
    if (options.callbacks) this.setCallbacks(options.callbacks);
  }

  setCallbacks(callbacks: WsClientCallbacks): void {
    this.callbacks = callbacks;
  }

  setCredentials(credentials: AuthCredentials): void {
    this.credentials = credentials;
  }

  addListener(listener: WsClientWebListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.alive && this.ws?.readyState === WebSocket.OPEN;
  }

  isOnline(): boolean {
    return this.connectionState === 'online';
  }

  getPendingCount(): number {
    return this.pending.size;
  }

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
    this.cleanupWs();

    const reject = this.connectReject;
    this.connectResolve = null;
    this.connectReject = null;
    this.connectPromise = null;
    reject?.(new Error(`Disconnected: ${reason}`));

    this.setState('idle');
    this.dispatch({ type: 'disconnect', reason });
  }

  private attemptConnection(): void {
    this.cleanupWs();

    this.setState('connecting');
    this.dispatch({ type: 'log', level: 'info', message: `connecting ${this.wsUrl}` });

    try {
      this.ws = new WebSocket(this.wsUrl);
      this.bindWsEvents();
    } catch (error) {
      this.handleWsError(error as Error);
    }
  }

  private bindWsEvents(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      if (this.ws !== this.ws) return; // This check doesn't work for WebSocket, but kept for consistency
      this.onWsOpen();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (this.ws !== this.ws) return;
      try {
        this.onWsMessage(event.data as string);
      } catch (error) {
        this.handleWsError(error as Error);
      }
    };

    this.ws.onerror = () => {
      if (this.ws !== this.ws) return;
      this.handleWsError(new Error('WebSocket error'));
    };

    this.ws.onclose = (event) => {
      if (this.ws !== this.ws) return;
      this.finishDisconnect(event.reason || 'closed');
    };
  }

  private onWsOpen(): void {
    this.alive = true;
    this.lastSendAt = Date.now();
    this.lastActivityAt = this.lastSendAt;
    this.setState('waiting');
    this.dispatch({ type: 'connect', host: this.wsUrl, port: 443 });

    this.sendRaw(this.buildStreamOpen(false));
  }

  private onWsMessage(data: string | ArrayBuffer): void {
    const text = typeof data === 'string' ? data : utf8Decode(new Uint8Array(data));
    const stanzas = this.parser.push(text);
    for (const stanza of stanzas) this.handleStanza(stanza);
  }

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
    else if (stanza.tag === 'presence') this.dispatch({ type: 'stanza', stanza } as WsClientWebEvent);

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
      if (mobile) this.dispatch({ type: 'log', level: 'info', message: `mobile validated: ${mobile}` });
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
    this.cleanupWs();
  }

  private onConnectTimeout(): void {
    this.connectTimer = null;
    const reject = this.connectReject;
    this.connectResolve = null;
    this.connectReject = null;
    this.connectPromise = null;
    this.failAllRequests(new Error('Connection timed out'));
    this.setState('failed-connect');
    this.cleanupWs();
    reject?.(new Error('Connection timed out'));
  }

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
      this.dispatch({ type: 'stanza', stanza } as WsClientWebEvent);
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

    if (messageId) {
      if (this.seenMessageIds.has(messageId)) return;
      this.rememberMessageId(messageId);
    }

    const from = this.readFirst(stanza.keys, [
      'message.amaz-from',
      'message.sms-from',
      'message.from',
      'message.amaz-abm-from',
      'message/email.from',
    ]);

    const timestampRaw = this.readFirst(stanza.keys, ['message.ts', 'message/timestamp']);
    const timestampNumber = Number(timestampRaw);
    const timestamp =
      Number.isFinite(timestampNumber) && timestampNumber > 0
        ? timestampNumber
        : Math.floor(Date.now() / 1000);

    const protocol = (stanza.keys['message.amaz-protocol'] ?? 'im') as MessageProtocol;

    // Check for chat protocol
    if (protocol === 'chat') {
      const chatMessage: InboundChatMessage = {
        roomId: stanza.keys['message/msg.room'] ?? stanza.keys['message.to'] ?? '',
        from,
        nick: stanza.keys['message/msg.from'] ?? stanza.keys['message.amaz-display-name'] ?? from,
        body: stanza.keys['message/body'] ?? '',
        timestamp,
        msgId: messageId,
        type:
          (stanza.keys['message/msg.type'] as 'groupchat' | 'privatechat' | 'invite') ??
          'groupchat',
        recipient: stanza.keys['message/recipient.username'],
        isInvite: 'message.amaz-buddy-invite' in stanza.keys,
      };

      if (messageId && from) this.sendAck(messageId, from);
      this.lastActivityAt = Date.now();
      this.dispatch({ type: 'chat-message', message: chatMessage });
      this.callbacks.onChatMessage?.(chatMessage);
      return;
    }

    const retriesRaw = this.readFirst(stanza.keys, ['tries', 'message.amaz-retry']);
    const retriesNumber = Number(retriesRaw);

    const recipients = stanza.arrays['message/recipient.username'] ?? [];
    const contactUsernames = stanza.arrays['message/contact.username'] ?? [];
    const contactDisplayNames = stanza.arrays['message/contact.displayname'] ?? [];

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

    if (messageId && from) this.sendAck(messageId, from);

    this.lastActivityAt = Date.now();
    this.dispatch({ type: 'message', message: inbound });
    this.callbacks.onMessage?.(inbound);
  }

  private readFirst(keys: Record<string, string>, candidates: readonly string[]): string {
    for (const key of candidates) {
      const value = keys[key];
      if (value !== undefined && value !== '') return value;
    }
    return '';
  }

  private rememberMessageId(messageId: string): void {
    this.seenMessageIds.add(messageId);
    this.seenMessageOrder.push(messageId);
    while (this.seenMessageOrder.length > PROTOCOL.ACK_RING_SIZE) {
      const oldest = this.seenMessageOrder.shift();
      if (oldest) this.seenMessageIds.delete(oldest);
    }
  }

  private dispatch(event: WsClientWebEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }

    const cb = this.callbacks;
    switch (event.type) {
      case 'connect':
        cb.onConnect?.(event.host, event.port);
        break;
      case 'auth-success':
        break;
      case 'message':
        break;
      case 'chat-message':
        break;
      case 'chat-presence':
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

  private sendRaw(data: string): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket is not connected');
    ws.send(data);
    this.lastSendAt = Date.now();
    this.lastActivityAt = this.lastSendAt;
    if (this.idleSent) {
      this.idleSent = false;
      this.sendIdleState(false);
    }
  }

  private sendKeepAlive(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(PROTOCOL.KEEPALIVE_BYTE);
    this.lastSendAt = Date.now();
  }

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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.connectionState !== 'online' && this.connectionState !== 'reinit') return;

    const now = Date.now();

    if (now - this.lastSendAt >= this.keepAliveMs) this.sendKeepAlive();

    if (now - this.lastActivityAt >= this.idleIntervalMs) {
      if (!this.idleSent) {
        this.idleSent = true;
        this.sendIdleState(true);
      }
    }

    for (const entry of [...this.pending.values()]) {
      if (now - entry.lastSentAt < this.retryIntervalMs) continue;
      entry.tries += 1;
      if (entry.tries <= this.retryLimit) {
        entry.lastSentAt = now;
        entry.xml = entry.xml.replace(/amaz-retry='\d+'/, `amaz-retry='${entry.tries}'`);
        try {
          this.sendRaw(entry.xml);
        } catch (error) {
          this.dispatch({ type: 'error', error: error as Error });
        }
      } else {
        this.pending.delete(entry.msgId);
        this.dispatch({ type: 'message-failed', pending: entry });
      }
    }
  }

  private handleWsError(error: Error): void {
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
      this.cleanupWs();
      reject(error);
    }
  }

  private finishDisconnect(reason: string): void {
    if (!this.alive && this.connectionState === 'idle') return;
    const wasAlive = this.alive;
    this.alive = false;
    this.clearTimers();
    this.failAllRequests(new Error(`Connection ${reason}`));
    this.cleanupWs();

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
    this.dispatch({ type: 'log', level: 'info', message: `reconnecting in ${delay}ms (attempt ${attempt + 1})` });

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnecting = false;
      if (!this.shouldReconnect) return;
      this.attemptConnection();
    }, delay);
  }

  private cleanupWs(): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch {
      // ignore
    }
  }

  private failAllRequests(_error: Error): void {
    // No pending requests in this implementation
    // Note: We don't have a requests map like the TCP client
  }
}

/**
 * XML stream parser for WebSocket - same as TCP but adapted for string chunks.
 */
class WebXmlStreamParser {
  private buffer = '';
  private stack: { name: string; path: string; text: string }[] = [];
  private keys: Record<string, string> = {};
  private arrays: Record<string, string[]> = {};

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
      if (gt === -1) break;
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
      this.closeElement(this.stripNamespace(trimmed.slice(1).trim()), out);
      return;
    }

    const selfClosing = trimmed.endsWith('/');
    const body = selfClosing ? trimmed.slice(0, -1) : trimmed;
    const spaceIndex = body.search(/\s/);
    const rawName = spaceIndex === -1 ? body : body.slice(0, spaceIndex);
    const name = this.stripNamespace(rawName);
    const attrString = spaceIndex === -1 ? '' : body.slice(spaceIndex + 1);
    const attrs = this.parseAttributes(attrString);

    if (name === 'stream') {
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

    const frame = { name, path, text: '' };
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
    if (!frame) return;
    this.finishElement(frame, out);
  }

  private finishElement(frame: { name: string; path: string; text: string }, out: Stanza[]): void {
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
    if (!frame) return;
    frame.text += isCdata ? text : this.decodeEntities(text);
  }

  private pushArray(key: string, value: string): void {
    const existing = this.arrays[key];
    if (existing) existing.push(value);
    else this.arrays[key] = [value];
  }

  private stripNamespace(name: string): string {
    const index = name.lastIndexOf(':');
    return index === -1 ? name : name.slice(index + 1);
  }

  private parseAttributes(input: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null = re.exec(input);
    while (match !== null) {
      const key = match[1];
      if (key) attrs[this.stripNamespace(key)] = this.decodeEntities(match[2] ?? match[3] ?? '');
      match = re.exec(input);
    }
    return attrs;
  }

  private decodeEntities(value: string): string {
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
}

/** Shared, application-wide WebSocket client instance. */
export const wsClientWeb = new WsClientWeb({
  wsUrl: DEFAULT_WS_HOST,
});
