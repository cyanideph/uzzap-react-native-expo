import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from '../storage/secureStorage';

/**
 * Supabase client — the primary backend (Auth, Postgres, Realtime).
 *
 * Replaces the legacy raw-TCP transport (`wsClient.ts`, now retired).
 * Config comes from EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
 * (see `.env.example`). The anon key is public by design; Row Level Security
 * policies in `supabase/schema.sql` enforce per-user data isolation.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your project values.',
  );
}

/**
 * supabase-js storage adapter backed by expo-secure-store so refresh tokens
 * never touch plain AsyncStorage.
 */
const secureStorageAdapter = {
  getItem: (key: string): Promise<string | null> => getSecureItem(key),
  setItem: (key: string, value: string): Promise<void> => setSecureItem(key, value),
  removeItem: (key: string): Promise<void> => deleteSecureItem(key),
};

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}
