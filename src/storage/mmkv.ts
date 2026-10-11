import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MMKV } from 'react-native-mmkv';

/**
 * Synchronous hot-path key/value storage.
 *
 * Backed by MMKV when the native module is present (dev builds / bare
 * workflow). In Expo Go — where MMKV is unavailable — it transparently falls
 * back to a memory map persisted to AsyncStorage. All accessors are
 * **synchronous** so they can be read during render without suspending.
 */

export interface HotKV {
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: string | number | boolean): void;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
  clearAll(): void;
}

const FALLBACK_PREFIX = 'uzzap.mmkv.';

class MemoryHotKV implements HotKV {
  private readonly map = new Map<string, string | number | boolean>();
  private hydrated = false;

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const keys = await AsyncStorage.getAllKeys();
      const ours = keys.filter((k) => k.startsWith(FALLBACK_PREFIX));
      if (ours.length === 0) return;
      const pairs = await AsyncStorage.multiGet(ours);
      for (const [k, v] of pairs) {
        if (v != null) this.map.set(k.slice(FALLBACK_PREFIX.length), v);
      }
    } catch {
      // ignore hydration failures
    }
  }

  constructor() {
    void this.hydrate();
  }

  getString(key: string): string | undefined {
    const v = this.map.get(key);
    return typeof v === 'string' ? v : undefined;
  }

  getNumber(key: string): number | undefined {
    const v = this.map.get(key);
    return typeof v === 'number' ? v : undefined;
  }

  getBoolean(key: string): boolean | undefined {
    const v = this.map.get(key);
    return typeof v === 'boolean' ? v : undefined;
  }

  set(key: string, value: string | number | boolean): void {
    this.map.set(key, value);
    void AsyncStorage.setItem(`${FALLBACK_PREFIX}${key}`, String(value)).catch(() => undefined);
  }

  delete(key: string): void {
    this.map.delete(key);
    void AsyncStorage.removeItem(`${FALLBACK_PREFIX}${key}`).catch(() => undefined);
  }

  contains(key: string): boolean {
    return this.map.has(key);
  }

  getAllKeys(): string[] {
    return [...this.map.keys()];
  }

  clearAll(): void {
    const keys = this.getAllKeys();
    this.map.clear();
    void AsyncStorage.multiRemove(keys.map((k) => `${FALLBACK_PREFIX}${k}`)).catch(() => undefined);
  }
}

class MmkvHotKV implements HotKV {
  constructor(private readonly instance: MMKV) {}

  getString(key: string): string | undefined {
    return this.instance.getString(key);
  }

  getNumber(key: string): number | undefined {
    return this.instance.getNumber(key);
  }

  getBoolean(key: string): boolean | undefined {
    return this.instance.getBoolean(key);
  }

  set(key: string, value: string | number | boolean): void {
    this.instance.set(key, value);
  }

  delete(key: string): void {
    this.instance.delete(key);
  }

  contains(key: string): boolean {
    return this.instance.contains(key);
  }

  getAllKeys(): string[] {
    return this.instance.getAllKeys();
  }

  clearAll(): void {
    this.instance.clearAll();
  }
}

function createHotKV(): { kv: HotKV; backend: 'mmkv' | 'memory' } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const instance = new mod.MMKV({ id: 'uzzap', encryptionKey: 'uzzap-local-cache' });
    return { kv: new MmkvHotKV(instance), backend: 'mmkv' };
  } catch {
    return { kv: new MemoryHotKV(), backend: 'memory' };
  }
}

const { kv, backend } = createHotKV();

export const hotKV: HotKV = kv;
export const hotKVBackend: 'mmkv' | 'memory' = backend;

/** Well-known hot-path keys. */
export const HOT_KEYS = {
  authPhase: 'auth.phase',
  lastPresence: 'presence.self',
  lastRosterSync: 'roster.lastSync',
  unreadTotal: 'messages.unreadTotal',
  connectionState: 'net.state',
} as const;
