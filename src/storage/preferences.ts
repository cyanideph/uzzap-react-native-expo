import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AsyncStorage helpers for non-sensitive preferences (theme, onboarding flags)
 * and small JSON blobs that need to survive cold starts.
 */

export const PREF_KEYS = {
  themeId: 'uzzap.theme.id',
  themeMode: 'uzzap.theme.mode',
  hasSeenIntro: 'uzzap.onboarding.seen',
  lastUserId: 'uzzap.auth.lastUserId',
  lastHost: 'uzzap.net.lastHost',
  settings: 'uzzap.settings',
  migrationsDone: 'uzzap.db.migrated',
} as const;

export async function getString(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Storage full / unavailable — non-fatal for preferences.
  }
}

export async function removeString(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON<T>(key: string, value: T): Promise<void> {
  await setString(key, JSON.stringify(value));
}

export async function getBool(key: string, fallback = false): Promise<boolean> {
  const raw = await getString(key);
  if (raw === null) return fallback;
  return raw === 'true' || raw === '1';
}

export async function setBool(key: string, value: boolean): Promise<void> {
  await setString(key, value ? 'true' : 'false');
}
