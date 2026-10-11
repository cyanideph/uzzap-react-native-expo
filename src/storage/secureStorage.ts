import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore wrapper for auth tokens, credentials and PINs.
 *
 * SecureStore has a ~2048-byte value limit on Android (keystore-encrypted
 * preferences); JSON values are size-checked and large payloads are rejected
 * rather than silently truncated.
 */

export const SECURE_KEYS = {
  authSession: 'uzzap.auth.session',
  authToken: 'uzzap.auth.token',
  username: 'uzzap.auth.username',
  password: 'uzzap.auth.password',
  pin: 'uzzap.auth.pin',
  biometricSecret: 'uzzap.auth.biometric',
  serverHost: 'uzzap.net.host',
  serverPort: 'uzzap.net.port',
} as const;

export type SecureKey = (typeof SECURE_KEYS)[keyof typeof SECURE_KEYS];

const MAX_SECURE_BYTES = 2048;

export const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

export async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (byteLength(value) > MAX_SECURE_BYTES) {
    throw new Error(
      `SecureStore value for "${key}" exceeds ${MAX_SECURE_BYTES} bytes; store a reference instead.`,
    );
  }
  await SecureStore.setItemAsync(key, value, secureStoreOptions);
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, secureStoreOptions);
  } catch {
    return null;
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, secureStoreOptions);
  } catch {
    // Already absent / unsupported — ignore.
  }
}

export async function setSecureJson<T>(key: string, value: T): Promise<void> {
  await setSecureItem(key, JSON.stringify(value));
}

export async function getSecureJson<T>(key: string): Promise<T | null> {
  const raw = await getSecureItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Remove every value this app owns (used on logout / delete account). */
export async function clearSecureStore(): Promise<void> {
  await Promise.all(Object.values(SECURE_KEYS).map((key) => deleteSecureItem(key)));
}

function byteLength(value: string): number {
  // Hermes/RN provide TextEncoder in modern runtimes; fall back conservatively.
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return value.length * 2;
}
