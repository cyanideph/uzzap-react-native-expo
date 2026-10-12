import type { AppSettings } from '../types/models';
import { contactService } from './contactService';
import { messageService } from './messageService';
import { chatRoomService } from './chatRoomService';
import { presenceService } from './presenceService';
// Side-effect import: the chat-room singleton owns no transport listeners;
// subscriptions are started explicitly in `startAuthenticatedSession`.
import { pushService } from './pushService';
import { settingsService } from './settingsService';
import { isSupabaseConfigured, supabase } from './supabaseClient';

/**
 * Runtime bootstrap (Supabase backend).
 *
 * The legacy raw-TCP transport (`wsClient.ts`) is retired; domain services
 * now talk to Supabase Postgres + Realtime. `bootstrapServices()` performs
 * the one-off, post-migration app-start work; `startAuthenticatedSession()`
 * warms the session once auth resolves.
 */

let servicesPromise: Promise<AppSettings | null> | null = null;
let settingsPromise: Promise<AppSettings | null> | null = null;
let pushRegistered = false;
let realtimeStarted = false;

/** Load persisted settings exactly once, after migrations have run. */
export function loadSettingsOnce(): Promise<AppSettings | null> {
  if (!settingsPromise) {
    settingsPromise = settingsService.load().catch(() => null);
  }
  return settingsPromise;
}

/**
 * Post-migration bootstrap: configure notifications and load settings.
 * Idempotent — safe to call from multiple mount points.
 */
export function bootstrapServices(): Promise<AppSettings | null> {
  if (!servicesPromise) {
    servicesPromise = (async () => {
      pushService.configure();
      return loadSettingsOnce();
    })();
  }
  return servicesPromise;
}

/** Register for push once the user is authenticated. Best-effort. */
async function registerPushOnce(): Promise<void> {
  if (pushRegistered) return;
  pushRegistered = true;
  try {
    await pushService.registerForPush();
  } catch {
    pushRegistered = false;
  }
}

/** Start Realtime channels once the user is authenticated. Best-effort. */
function startRealtimeOnce(): void {
  if (realtimeStarted) return;
  realtimeStarted = true;
  try {
    messageService.subscribeMessages();
  } catch {
    realtimeStarted = false;
  }
  try {
    void presenceService.subscribe();
  } catch {
    // Presence is best-effort.
  }
  try {
    chatRoomService.subscribeChat();
  } catch {
    // Best effort.
  }
}

/** Rehydrate roster + conversation/message caches from SQLite. */
async function hydrateStoreFromDatabase(): Promise<void> {
  await contactService.hydrateFromDatabase().catch(() => undefined);
  await messageService.hydrateFromDatabase().catch(() => undefined);
  await chatRoomService.hydrateFromDatabase().catch(() => undefined);
}

/** Pull server state into the store (Supabase → store → SQLite mirror). */
async function syncFromServer(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
  } catch {
    return;
  }
  await contactService.syncRoster().catch(() => undefined);
  await messageService.syncFromServer().catch(() => undefined);
  await chatRoomService.syncRooms().catch(() => undefined);
  await messageService.flushOfflineQueue().catch(() => undefined);
}

/**
 * Warm the authenticated session: load settings, start Realtime, register
 * for push and hydrate local data. Safe to call on every transition to
 * `signed-in`; every step is idempotent.
 */
export async function startAuthenticatedSession(): Promise<void> {
  await loadSettingsOnce();
  startRealtimeOnce();
  await registerPushOnce();
  await hydrateStoreFromDatabase();
  await syncFromServer();
}
