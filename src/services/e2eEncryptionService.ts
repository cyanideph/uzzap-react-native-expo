import {
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  KeyHelper,
} from 'libsignal-protocol-typescript';

import { getSecureItem, setSecureItem, deleteSecureItem } from '../storage/secureStorage';

type PreKeyBundle = {
  registrationId: number;
  deviceId: number;
  preKey: { keyId: number; publicKey: Uint8Array } | null;
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array;
    signature: Uint8Array;
  };
  identityKey: Uint8Array;
};

const IDENTITY_KEY_PAIR_KEY = 'uzzap.e2e.identity_key';
const REGISTRATION_ID_KEY = 'uzzap.e2e.registration_id';
const PRE_KEYS_KEY = 'uzzap.e2e.pre_keys';
const SIGNED_PRE_KEY_KEY = 'uzzap.e2e.signed_pre_key';
const SESSIONS_PREFIX = 'uzzap.e2e.session.';

interface StoredIdentityKeyPair {
  publicKey: number[];
  privateKey: number[];
}

interface StoredPreKey {
  keyId: number;
  publicKey: number[];
  privateKey: number[];
}

interface StoredSignedPreKey {
  keyId: number;
  publicKey: number[];
  privateKey: number[];
  signature: number[];
}

function toU8(arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

function toArr(u8: Uint8Array): number[] {
  return Array.from(u8);
}

export class SignalKeyStore {
  async getIdentityKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array } | null> {
    const stored = await getSecureItem(IDENTITY_KEY_PAIR_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as StoredIdentityKeyPair;
    return { publicKey: toU8(parsed.publicKey), privateKey: toU8(parsed.privateKey) };
  }

  async getLocalRegistrationId(): Promise<number | null> {
    const stored = await getSecureItem(REGISTRATION_ID_KEY);
    if (!stored) return null;
    return parseInt(stored, 10);
  }

  async getIdentity(_address: SignalProtocolAddress): Promise<Uint8Array | null> {
    return null;
  }

  async saveIdentity(
    _address: SignalProtocolAddress,
    _identityKey: Uint8Array,
  ): Promise<boolean> {
    return true;
  }

  async isTrustedIdentity(
    _address: SignalProtocolAddress,
    _identityKey: Uint8Array,
  ): Promise<boolean> {
    return true;
  }

  async loadPreKey(keyId: number): Promise<{ keyId: number; publicKey: ArrayBuffer; privateKey: ArrayBuffer } | null> {
    const stored = await getSecureItem(`${PRE_KEYS_KEY}.${keyId}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as StoredPreKey;
    const pub = toU8(parsed.publicKey);
    const priv = toU8(parsed.privateKey);
    return {
      keyId: parsed.keyId,
      publicKey: pub.buffer.slice(pub.byteOffset, pub.byteOffset + pub.byteLength) as ArrayBuffer,
      privateKey: priv.buffer.slice(priv.byteOffset, priv.byteOffset + priv.byteLength) as ArrayBuffer,
    };
  }

  async storePreKey(
    keyId: number,
    keyPair: { publicKey: ArrayBuffer | Uint8Array; privateKey: ArrayBuffer | Uint8Array },
  ): Promise<void> {
    const pub = keyPair.publicKey instanceof Uint8Array ? keyPair.publicKey : new Uint8Array(keyPair.publicKey);
    const priv = keyPair.privateKey instanceof Uint8Array ? keyPair.privateKey : new Uint8Array(keyPair.privateKey);
    const stored: StoredPreKey = {
      keyId,
      publicKey: toArr(pub),
      privateKey: toArr(priv),
    };
    await setSecureItem(`${PRE_KEYS_KEY}.${keyId}`, JSON.stringify(stored));
  }

  async removePreKey(keyId: number): Promise<void> {
    await deleteSecureItem(`${PRE_KEYS_KEY}.${keyId}`);
  }

  async loadSignedPreKey(
    keyId: number,
  ): Promise<{ keyId: number; publicKey: ArrayBuffer; privateKey: ArrayBuffer; signature: ArrayBuffer } | null> {
    const stored = await getSecureItem(`${SIGNED_PRE_KEY_KEY}.${keyId}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as StoredSignedPreKey;
    const pub = toU8(parsed.publicKey);
    const priv = toU8(parsed.privateKey);
    const sig = toU8(parsed.signature);
    return {
      keyId: parsed.keyId,
      publicKey: pub.buffer.slice(pub.byteOffset, pub.byteOffset + pub.byteLength) as ArrayBuffer,
      privateKey: priv.buffer.slice(priv.byteOffset, priv.byteOffset + priv.byteLength) as ArrayBuffer,
      signature: sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength) as ArrayBuffer,
    };
  }

  async storeSignedPreKey(
    keyId: number,
    keyPair: { publicKey: ArrayBuffer | Uint8Array; privateKey: ArrayBuffer | Uint8Array; signature: ArrayBuffer | Uint8Array },
  ): Promise<void> {
    const pub = keyPair.publicKey instanceof Uint8Array ? keyPair.publicKey : new Uint8Array(keyPair.publicKey);
    const priv = keyPair.privateKey instanceof Uint8Array ? keyPair.privateKey : new Uint8Array(keyPair.privateKey);
    const sig = keyPair.signature instanceof Uint8Array ? keyPair.signature : new Uint8Array(keyPair.signature);
    const stored: StoredSignedPreKey = {
      keyId,
      publicKey: toArr(pub),
      privateKey: toArr(priv),
      signature: toArr(sig),
    };
    await setSecureItem(`${SIGNED_PRE_KEY_KEY}.${keyId}`, JSON.stringify(stored));
  }

  async removeSignedPreKey(keyId: number): Promise<void> {
    await deleteSecureItem(`${SIGNED_PRE_KEY_KEY}.${keyId}`);
  }

  async loadSession(address: SignalProtocolAddress): Promise<string | null> {
    const stored = await getSecureItem(`${SESSIONS_PREFIX}${address.toString()}`);
    return stored;
  }

  async storeSession(address: SignalProtocolAddress, record: string): Promise<void> {
    await setSecureItem(`${SESSIONS_PREFIX}${address.toString()}`, record);
  }

  async removeSession(address: SignalProtocolAddress): Promise<void> {
    await deleteSecureItem(`${SESSIONS_PREFIX}${address.toString()}`);
  }

  async removeAllSessions(address: SignalProtocolAddress): Promise<void> {
    await deleteSecureItem(`${SESSIONS_PREFIX}${address.toString()}`);
  }
}

export class E2EEncryptionService {
  private keyStore: SignalKeyStore;
  private sessionBuilders: Map<string, SessionBuilder> = new Map();
  private sessionCiphers: Map<string, SessionCipher> = new Map();

  constructor() {
    this.keyStore = new SignalKeyStore();
  }

  async initialize(): Promise<void> {
    const existing = await this.keyStore.getIdentityKeyPair();
    if (!existing) {
      const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
      await setSecureItem(IDENTITY_KEY_PAIR_KEY, JSON.stringify({
        publicKey: toArr(new Uint8Array(identityKeyPair.pubKey)),
        privateKey: toArr(new Uint8Array(identityKeyPair.privKey)),
      }));
    }

    const existingRegId = await this.keyStore.getLocalRegistrationId();
    if (!existingRegId) {
      const regId = KeyHelper.generateRegistrationId();
      await setSecureItem(REGISTRATION_ID_KEY, String(regId));
    }
  }

  async generatePreKeys(count = 100): Promise<void> {
    const startId = Math.floor(Math.random() * 10000);
    for (let i = 0; i < count; i++) {
      const keyId = startId + i;
      const preKey = await KeyHelper.generatePreKey(keyId);
      await this.keyStore.storePreKey(preKey.keyId, {
        publicKey: new Uint8Array(preKey.keyPair.pubKey),
        privateKey: new Uint8Array(preKey.keyPair.privKey),
      });
    }
  }

  async generateSignedPreKey(): Promise<void> {
    const keyId = Math.floor(Math.random() * 10000);
    const identity = await this.keyStore.getIdentityKeyPair();
    if (!identity) throw new Error('No identity key pair');
    const signedPreKey = await KeyHelper.generateSignedPreKey(identity as any, keyId);
    await this.keyStore.storeSignedPreKey(signedPreKey.keyId, {
      publicKey: new Uint8Array(signedPreKey.keyPair.pubKey),
      privateKey: new Uint8Array(signedPreKey.keyPair.privKey),
      signature: new Uint8Array(signedPreKey.signature),
    });
  }

  async getPreKeyBundle(): Promise<PreKeyBundle> {
    const identity = await this.keyStore.getIdentityKeyPair();
    const regId = await this.keyStore.getLocalRegistrationId();
    if (!identity || !regId) throw new Error('Not initialized');

    const preKey = await KeyHelper.generatePreKey(1);
    const signedPreKey = await KeyHelper.generateSignedPreKey(identity as any, 1);

    return {
      registrationId: regId,
      deviceId: 1,
      preKey: { keyId: preKey.keyId, publicKey: new Uint8Array(preKey.keyPair.pubKey) },
      signedPreKey: {
        keyId: signedPreKey.keyId,
        publicKey: new Uint8Array(signedPreKey.keyPair.pubKey),
        signature: new Uint8Array(signedPreKey.signature),
      },
      identityKey: new Uint8Array(identity.publicKey),
    };
  }

  async encryptMessage(
    recipientAddress: string,
    recipientBundle: PreKeyBundle,
    plaintext: string,
  ): Promise<{ type: number; body: Uint8Array }> {
    const address = new SignalProtocolAddress(recipientAddress, 1);

    let builder = this.sessionBuilders.get(recipientAddress);
    if (!builder) {
      builder = new SessionBuilder(this.keyStore as any, address);
      this.sessionBuilders.set(recipientAddress, builder);
    }

    const preKeyMessage = {
      registrationId: recipientBundle.registrationId,
      identityKey: recipientBundle.identityKey,
      signedPreKey: {
        keyId: recipientBundle.signedPreKey.keyId,
        publicKey: recipientBundle.signedPreKey.publicKey,
        signature: recipientBundle.signedPreKey.signature,
      },
      preKey: recipientBundle.preKey
        ? {
            keyId: recipientBundle.preKey.keyId,
            publicKey: recipientBundle.preKey.publicKey,
          }
        : null,
    };

    await builder.processPreKey(preKeyMessage as any);

    const cipher = new SessionCipher(this.keyStore as any, address);
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertext = await cipher.encrypt(plaintextBytes);

    return { type: ciphertext.type, body: ciphertext.body as unknown as Uint8Array };
  }

  async decryptMessage(
    senderAddress: string,
    ciphertext: { type: number; body: Uint8Array },
  ): Promise<string> {
    const address = new SignalProtocolAddress(senderAddress, 1);
    const cipher = new SessionCipher(this.keyStore, address);

    let plaintextBytes: Uint8Array;
    if (ciphertext.type === 3) {
      plaintextBytes = await cipher.decryptPreKeyWhisperMessage(ciphertext.body);
    } else {
      plaintextBytes = await cipher.decryptWhisperMessage(ciphertext.body);
    }

    return new TextDecoder().decode(plaintextBytes);
  }

  async hasSession(address: string): Promise<boolean> {
    const session = await this.keyStore.loadSession(new SignalProtocolAddress(address, 1));
    return session !== null;
  }

  async deleteSession(address: string): Promise<void> {
    await this.keyStore.removeSession(new SignalProtocolAddress(address, 1));
    this.sessionBuilders.delete(address);
    this.sessionCiphers.delete(address);
  }

  async getMyIdentityKey(): Promise<Uint8Array> {
    const identity = await this.keyStore.getIdentityKeyPair();
    if (!identity) throw new Error('No identity key pair');
    return identity.publicKey;
  }

  async getMyRegistrationId(): Promise<number> {
    const regId = await this.keyStore.getLocalRegistrationId();
    if (!regId) throw new Error('No registration ID');
    return regId;
  }
}

export const e2eEncryptionService = new E2EEncryptionService();
