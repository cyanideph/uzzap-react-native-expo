import protobuf from 'protobufjs';

/**
 * Protobuf schema + (de)serialisation for the Uzzap wire protocol.
 *
 * The schema below is the typed, binary mirror of the legacy XML stanza model
 * (see `PROTOCOL_SPEC.md` §3–§10). It is transport-agnostic: `wsClient.ts`
 * owns the legacy raw-TCP/XML path, while this module can be used to
 * (de)serialise the same stanzas over a modern framed transport (websocket,
 * length-prefixed TCP, …) without a `.proto` toolchain at runtime — the schema
 * is declared as a JSON descriptor.
 *
 * Field names intentionally use `snake_case` to match the wire attribute names
 * exactly (`amaz_protocol` ↔ `amaz-protocol`, `amaz_msg_id` ↔ `amaz-msg-id`).
 */

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

export const PROTO_SOURCE = `syntax = "proto3";
package uzzap;

message StreamOpen {
  string to = 1;
  string xmlns = 2;
  string version = 3;
  string client_version = 4;
  string flags = 5;
}

message AuthPlain {
  string mechanism = 1;   // "PLAIN"
  string credentials = 2; // base64(\\0 user \\0 pass)
}

message IQ {
  string type = 1;        // get/set/response/error
  string id = 2;
  string to = 3;
  string amaz_protocol = 4;
  Action action = 5;
  VCard vcard = 6;
  string protocol = 7;    // for ack
  string amaz_msg_id = 8;
  Error error = 9;
}

message Action {
  string name = 1;
}

message VCard {
  string username = 1;
  string amaz_cid = 2;
  string displayname = 3;
  string phone = 4;
  string email = 5;
  string groups = 6; // comma-separated
}

message Message {
  string to = 1;
  string amaz_msg_id = 2;
  int32 amaz_retry = 3;
  string amaz_location = 4;
  string type = 5; // chat/sms/email
  string body = 6;
  Recipient recipient = 7;
  Contact contact = 8;
}

message Recipient {
  string username = 1;
  string displayname = 2;
}

message Contact {
  string username = 1;
  string displayname = 2;
}

message AckIQ {
  string protocol = 1; // "amaz-msg-ack"
  string amaz_msg_id = 2;
  string to = 3;
  string type = 4; // "set"
}

message PresenceIQ {
  string amaz_protocol = 1; // "registry"
  Action action = 2;        // name="update-idle-state"
  State state = 3;
}

message State {
  string value = 1; // "idle" | "not-idle"
}

message Error {
  string amaz_error = 1;
}`;

const PROTO_SCHEMA = {
  nested: {
    uzzap: {
      nested: {
        StreamOpen: {
          fields: {
            to: { type: 'string', id: 1 },
            xmlns: { type: 'string', id: 2 },
            version: { type: 'string', id: 3 },
            client_version: { type: 'string', id: 4 },
            flags: { type: 'string', id: 5 },
          },
        },
        AuthPlain: {
          fields: {
            mechanism: { type: 'string', id: 1 },
            credentials: { type: 'string', id: 2 },
          },
        },
        IQ: {
          fields: {
            type: { type: 'string', id: 1 },
            id: { type: 'string', id: 2 },
            to: { type: 'string', id: 3 },
            amaz_protocol: { type: 'string', id: 4 },
            action: { type: 'Action', id: 5 },
            vcard: { type: 'VCard', id: 6 },
            protocol: { type: 'string', id: 7 },
            amaz_msg_id: { type: 'string', id: 8 },
            error: { type: 'Error', id: 9 },
          },
        },
        Action: {
          fields: {
            name: { type: 'string', id: 1 },
          },
        },
        VCard: {
          fields: {
            username: { type: 'string', id: 1 },
            amaz_cid: { type: 'string', id: 2 },
            displayname: { type: 'string', id: 3 },
            phone: { type: 'string', id: 4 },
            email: { type: 'string', id: 5 },
            groups: { type: 'string', id: 6 },
          },
        },
        Message: {
          fields: {
            to: { type: 'string', id: 1 },
            amaz_msg_id: { type: 'string', id: 2 },
            amaz_retry: { type: 'int32', id: 3 },
            amaz_location: { type: 'string', id: 4 },
            type: { type: 'string', id: 5 },
            body: { type: 'string', id: 6 },
            recipient: { type: 'Recipient', id: 7 },
            contact: { type: 'Contact', id: 8 },
          },
        },
        Recipient: {
          fields: {
            username: { type: 'string', id: 1 },
            displayname: { type: 'string', id: 2 },
          },
        },
        Contact: {
          fields: {
            username: { type: 'string', id: 1 },
            displayname: { type: 'string', id: 2 },
          },
        },
        AckIQ: {
          fields: {
            protocol: { type: 'string', id: 1 },
            amaz_msg_id: { type: 'string', id: 2 },
            to: { type: 'string', id: 3 },
            type: { type: 'string', id: 4 },
          },
        },
        PresenceIQ: {
          fields: {
            amaz_protocol: { type: 'string', id: 1 },
            action: { type: 'Action', id: 2 },
            state: { type: 'State', id: 3 },
          },
        },
        State: {
          fields: {
            value: { type: 'string', id: 1 },
          },
        },
        Error: {
          fields: {
            amaz_error: { type: 'string', id: 1 },
          },
        },
      },
    },
  },
};

/** Root reflection object; safe to reuse across encode/decode calls. */
export const protobufRoot = protobuf.Root.fromJSON(PROTO_SCHEMA);

/** Looked-up message types, keyed by their short name. */
export const protoTypes = {
  StreamOpen: protobufRoot.lookupType('uzzap.StreamOpen'),
  AuthPlain: protobufRoot.lookupType('uzzap.AuthPlain'),
  IQ: protobufRoot.lookupType('uzzap.IQ'),
  Action: protobufRoot.lookupType('uzzap.Action'),
  VCard: protobufRoot.lookupType('uzzap.VCard'),
  Message: protobufRoot.lookupType('uzzap.Message'),
  Recipient: protobufRoot.lookupType('uzzap.Recipient'),
  Contact: protobufRoot.lookupType('uzzap.Contact'),
  AckIQ: protobufRoot.lookupType('uzzap.AckIQ'),
  PresenceIQ: protobufRoot.lookupType('uzzap.PresenceIQ'),
  State: protobufRoot.lookupType('uzzap.State'),
  Error: protobufRoot.lookupType('uzzap.Error'),
} as const;

export type ProtoMessageName = keyof typeof protoTypes;

/* -------------------------------------------------------------------------- */
/* Generic encode / decode                                                    */
/* -------------------------------------------------------------------------- */

export function encodeProto(name: ProtoMessageName, payload: Record<string, unknown>): Uint8Array {
  const type = protoTypes[name];
  const error = type.verify(payload);
  if (error) throw new Error(`Invalid protobuf ${name}: ${error}`);
  return type.encode(type.create(payload)).finish();
}

export function decodeProto(name: ProtoMessageName, bytes: Uint8Array): Record<string, unknown> {
  const type = protoTypes[name];
  return type.toObject(type.decode(bytes), {
    longs: Number,
    enums: String,
    bytes: String,
    defaults: false,
  }) as Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* Typed helpers                                                              */
/* -------------------------------------------------------------------------- */

export interface StreamOpenFields {
  to: string;
  xmlns: string;
  version: string;
  client_version?: string;
  flags?: string;
}

export function encodeStreamOpen(fields: StreamOpenFields): Uint8Array {
  return encodeProto('StreamOpen', { ...fields });
}

export function decodeStreamOpen(bytes: Uint8Array): StreamOpenFields {
  return decodeProto('StreamOpen', bytes) as unknown as StreamOpenFields;
}

/**
 * SASL PLAIN token: `base64("\0" + user + "\0" + pass)` (spec §4 / §8).
 * Returned as a string so it can be embedded in the legacy XML `<auth>` stanza.
 */
export function saslPlainToken(username: string, password: string): string {
  return base64EncodeUtf8(`\u0000${username}\u0000${password}`);
}

/** Protobuf variant of the PLAIN credentials (credentials already base64). */
export function encodeAuthPlain(username: string, password: string): Uint8Array {
  return encodeProto('AuthPlain', {
    mechanism: 'PLAIN',
    credentials: saslPlainToken(username, password),
  });
}

/** Build an assured-message ACK stanza payload (spec §10.1). */
export function makeAckIq(msgId: string, to: string): Record<string, unknown> {
  return { protocol: 'amaz-msg-ack', amaz_msg_id: msgId, to, type: 'set' };
}

/* -------------------------------------------------------------------------- */
/* Base64 (no Buffer dependency)                                              */
/* -------------------------------------------------------------------------- */

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    output += B64_ALPHABET[b0 >> 2];
    output += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    output += i + 1 < bytes.length ? B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    output += i + 2 < bytes.length ? B64_ALPHABET[b2 & 0x3f] : '=';
  }
  return output;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const output: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(clean[i] ?? 'A');
    const c1 = B64_ALPHABET.indexOf(clean[i + 1] ?? 'A');
    const c2 = B64_ALPHABET.indexOf(clean[i + 2] ?? 'A');
    const c3 = B64_ALPHABET.indexOf(clean[i + 3] ?? 'A');
    output.push((c0 << 2) | (c1 >> 4));
    if (clean[i + 2] !== '=') output.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (clean[i + 3] !== '=') output.push(((c2 & 0x03) << 6) | c3);
  }
  return new Uint8Array(output);
}

export function base64EncodeUtf8(value: string): string {
  return bytesToBase64(utf8Encode(value));
}

export function base64DecodeUtf8(base64: string): string {
  return utf8Decode(base64ToBytes(base64));
}

/* -------------------------------------------------------------------------- */
/* UTF-8 (no Buffer dependency)                                               */
/* -------------------------------------------------------------------------- */

export function utf8Encode(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);

  const bytes: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    let code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      }
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

export function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);

  let output = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0;
    if (b0 < 0x80) {
      output += String.fromCharCode(b0);
      i += 1;
    } else if (b0 < 0xe0 && i + 1 < bytes.length) {
      output += String.fromCharCode(((b0 & 0x1f) << 6) | ((bytes[i + 1] ?? 0) & 0x3f));
      i += 2;
    } else if (b0 < 0xf0 && i + 2 < bytes.length) {
      output += String.fromCharCode(
        ((b0 & 0x0f) << 12) | (((bytes[i + 1] ?? 0) & 0x3f) << 6) | ((bytes[i + 2] ?? 0) & 0x3f),
      );
      i += 3;
    } else if (i + 3 < bytes.length) {
      const cp =
        ((b0 & 0x07) << 18) |
        (((bytes[i + 1] ?? 0) & 0x3f) << 12) |
        (((bytes[i + 2] ?? 0) & 0x3f) << 6) |
        ((bytes[i + 3] ?? 0) & 0x3f);
      output += String.fromCodePoint(cp);
      i += 4;
    } else {
      i += 1;
    }
  }
  return output;
}
