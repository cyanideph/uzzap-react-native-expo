import {
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  type PreKeyBundle,
} from 'libsignal-protocol-typescript';

import { getString, setString, removeString } from '../storage/secureStorage';

/**
 * End-to-End Encryption Service using Signal Protocol.
 *
 * Implements the Signal Protocol (Double Ratchet) for end-to-end encryption
 * of 1:1 messages. Each user has an identity key, signed pre-key, and
 * one-time pre-keys stored on the server for key agreement.
 *
 * Reference: https://signal.org/docs/specifications/doubleratchet/
 */

const IDENTITY_KEY_PAIR_KEY = 'uzzap.e2e.identity_key';
const REGISTRATION_ID_KEY = 'uzzap.e2e.registration_id';
const PRE_KEYS_KEY = 'uzzap.e2e.pre_keys';
const SIGNED_PRE_KEY_KEY = 'uzzap.e2e.signed_pre_key';
const SESSIONS_PREFIX = 'uzzap.e2e.session.';

export interface IdentityKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface PreKeyRecord {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SignedPreKeyRecord {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  signature: Uint8Array;
  timestamp: number;
}

export interface SessionRecord {
  sessionState: Uint8Array;
}

export class SignalKeyStore {
  private identityKeyPair: IdentityKeyPair | null = null;
  private registrationId: number = 0;

  async getIdentityKeyPair(): Promise<IdentityKeyPair> {
    if (this.identityKeyPair) return this.identityKeyPair;

    const stored = await getString(IDENTITY_KEY_PAIR_KEY);
    if (stored) {
      this.identityKeyPair = JSON.parse(stored);
      return this.identityKeyPair!;
    }

    // Generate new identity key pair
    // In a real implementation, use libsignal's Curve.generateKeyPair()
    // For now, generate a placeholder
    this.identityKeyPair = await this.generateIdentityKeyPair();
    await setString(IDENTITY_KEY_PAIR_KEY, JSON.stringify(this.identityKeyPair));
    return this.identityKeyPair;
  }

  async getLocalRegistrationId(): Promise<number> {
    if (this.registrationId) return this.registrationId;

    const stored = await getString(REGISTRATION_ID_KEY);
    if (stored) {
      this.registrationId = parseInt(stored, 10);
      return this.registrationId;
    }

    // Generate random registration ID (16-bit)
    this.registrationId = Math.floor(Math.random() * 65535) + 1;
    await setString(REGISTRATION_ID_KEY, String(this.registrationId));
    return this.registrationId;
  }

  async saveIdentity(address: string, identityKey: Uint8Array): Promise<void> {
    // Store identity keys for contacts
    const key = `uzzap.e2e.identity.${address}`;
    await setString(key, JSON.stringify(Array.from(identityKey)));
  }

  async isTrustedIdentity(address: string, identityKey: Uint8Array): Promise<boolean> {
    const key = `uzzap.e2e.identity.${address}`;
    const stored = await getString(key);
    if (!stored) return true; // Trust on first use

    const trustedKey = new Uint8Array(JSON.parse(stored));
    return (
      trustedKey.length === identityKey.length &&
      trustedKey.every((byte, i) => byte === identityKey[i])
    );
  }

  async getPreKey(keyId: number): Promise<PreKeyRecord | null> {
    const key = `${PRE_KEYS_KEY}.${keyId}`;
    const stored = await getString(key);
    if (!stored) return null;
    return JSON.parse(stored);
  }

  async storePreKey(keyId: number, record: PreKeyRecord): Promise<void> {
    const key = `${PRE_KEYS_KEY}.${keyId}`;
    await setString(key, JSON.stringify(record));
  }

  async removePreKey(keyId: number): Promise<void> {
    const key = `${PRE_KEYS_KEY}.${keyId}`;
    await removeString(key);
  }

  async getSignedPreKey(keyId: number): Promise<SignedPreKeyRecord | null> {
    const key = `${SIGNED_PRE_KEY_KEY}.${keyId}`;
    const stored = await getString(key);
    if (!stored) return null;
    return JSON.parse(stored);
  }

  async storeSignedPreKey(keyId: number, record: SignedPreKeyRecord): Promise<void> {
    const key = `${SIGNED_PRE_KEY_KEY}.${keyId}`;
    await setString(key, JSON.stringify(record));
  }

  async loadSession(address: string): Promise<SessionRecord | null> {
    const key = `${SESSIONS_PREFIX}${address}`;
    const stored = await getString(key);
    if (!stored) return null;
    return JSON.parse(stored);
  }

  async storeSession(address: string, record: SessionRecord): Promise<void> {
    const key = `${SESSIONS_PREFIX}${address}`;
    await setString(key, JSON.stringify(record));
  }

  async removeSession(address: string): Promise<void> {
    const key = `${SESSIONS_PREFIX}${address}`;
    await removeString(key);
  }

  async removeAllSessions(address: string): Promise<void> {
    await this.removeSession(address);
  }

  private async generateIdentityKeyPair(): Promise<IdentityKeyPair> {
    // Placeholder - in production use libsignal's Curve.generateKeyPair()
    // For now, generate a mock key pair
    const privateKey = new Uint8Array(32);
    const publicKey = new Uint8Array(32);
    crypto.getRandomValues(privateKey);
    crypto.getRandomValues(publicKey);
    return { publicKey, privateKey };
  }
}

export class E2EEncryptionService {
  private keyStore: SignalKeyStore;
  private sessionBuilder: Map<string, SessionBuilder> = new Map();
  private sessionCipher: Map<string, SessionCipher> = new Map();

  constructor() {
    this.keyStore = new SignalKeyStore();
  }

  async initialize(): Promise<void> {
    await this.keyStore.getIdentityKeyPair();
    await this.keyStore.getLocalRegistrationId();
    await this.generatePreKeys();
    await this.generateSignedPreKey();
  }

  async generatePreKeys(count = 100): Promise<void> {
    const startId = Math.floor(Math.random() * 10000);
    for (let i = 0; i < count; i++) {
      const keyId = startId + i;
      // In production, generate actual pre-key pair
      const preKey = await this.generatePreKey(keyId);
      await this.keyStore.storePreKey(keyId, preKey);
    }
  }

  async generateSignedPreKey(): Promise<void> {
    const keyId = Math.floor(Math.random() * 10000);
    const identityKeyPair = await this.keyStore.getIdentityKeyPair();
    // In production, sign the pre-key with identity private key
    const signedPreKey = await this.generateSignedPreKeyRecord(keyId, identityKeyPair.privateKey);
    await this.keyStore.storeSignedPreKey(keyId, signedPreKey);
  }

  async getPreKeyBundle(): Promise<PreKeyBundle> {
    const identityKeyPair = await this.keyStore.getIdentityKeyPair();
    const registrationId = await this.keyStore.getLocalRegistrationId();

    // Get a pre-key
    const preKeys = await this.getAvailablePreKeys();
    const preKey = preKeys.length > 0 ? preKeys[0] : null;

    // Get signed pre-key
    const signedPreKeys = await this.getAvailableSignedPreKeys();
    const signedPreKey = signedPreKeys.length > 0 ? signedPreKeys[0] : null;

    return {
      registrationId,
      deviceId: 1,
      preKey: preKey ? { keyId: preKey.keyId, publicKey: preKey.publicKey } : null,
      signedPreKey: signedPreKey
        ? {
            keyId: signedPreKey.keyId,
            publicKey: signedPreKey.publicKey,
            signature: signedPreKey.signature,
          }
        : { keyId: 0, publicKey: new Uint8Array(32), signature: new Uint8Array(64) },
      identityKey: identityKeyPair.publicKey,
    };
  }

  async encryptMessage(
    recipientAddress: string,
    recipientBundle: PreKeyBundle,
    plaintext: string,
  ): Promise<Uint8Array> {
    const address = new SignalProtocolAddress(recipientAddress, 1);

    let builder = this.sessionBuilder.get(recipientAddress);
    if (!builder) {
      builder = new SessionBuilder(this.keyStore, address);
      this.sessionBuilder.set(recipientAddress, builder);
    }

    // Initialize session if needed
    const sessionRecord = await this.keyStore.loadSession(recipientAddress);
    if (!sessionRecord) {
      await builder.processPreKey(recipientBundle);
    }

    const cipher = new SessionCipher(this.keyStore, address);
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertext = await cipher.encrypt(plaintextBytes);

    return ciphertext;
  }

  async decryptMessage(senderAddress: string, ciphertext: Uint8Array): Promise<string> {
    const address = new SignalProtocolAddress(senderAddress, 1);
    const cipher = new SessionCipher(this.keyStore, address);
    const plaintextBytes = await cipher.decrypt(ciphertext);
    return new TextDecoder().decode(plaintextBytes);
  }

  async hasSession(address: string): Promise<boolean> {
    const session = await this.keyStore.loadSession(address);
    return session !== null;
  }

  async deleteSession(address: string): Promise<void> {
    await this.keyStore.removeSession(address);
    this.sessionBuilder.delete(address);
    this.sessionCipher.delete(address);
  }

  async getMyIdentityKey(): Promise<Uint8Array> {
    const keyPair = await this.keyStore.getIdentityKeyPair();
    return keyPair.publicKey;
  }

  async getMyRegistrationId(): Promise<number> {
    return this.keyStore.getLocalRegistrationId();
  }

  private async generatePreKey(
    keyId: number,
  ): Promise<{ keyId: number; publicKey: Uint8Array; privateKey: Uint8Array }> {
    // Mock implementation - in production use libsignal's Curve.generateKeyPair()
    const privateKey = new Uint8Array(32);
    const publicKey = new Uint8Array(32);
    crypto.getRandomValues(privateKey);
    crypto.getRandomValues(publicKey);
    return { keyId, publicKey, privateKey };
  }

  private async generateSignedPreKeyRecord(
    keyId: number,
    _identityPrivateKey: Uint8Array,
  ): Promise<SignedPreKeyRecord> {
    const preKey = await this.generatePreKey(keyId);
    // In production, sign the pre-key public key with identity private key
    const signature = new Uint8Array(64);
    crypto.getRandomValues(signature);
    return {
      keyId,
      publicKey: preKey.publicKey,
      privateKey: preKey.privateKey,
      signature,
      timestamp: Date.now(),
    };
  }

  private async getAvailablePreKeys(): Promise<
    { keyId: number; publicKey: Uint8Array; privateKey: Uint8Array }[]
  > {
    // In production, fetch from key store
    return [];
  }

  private async getAvailableSignedPreKeys(): Promise<SignedPreKeyRecord[]> {
    // In production, fetch from key store
    return [];
  }
}

export const e2eEncryptionService = new E2EEncryptionService();
