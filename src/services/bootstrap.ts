import type { AppSettings } from '../types/models';
import { getStoredCredentials } from './authService';
import { contactService } from './contactService';
import { messageService } from './messageService';
import { smsValidationService } from './smsValidationService';
// Side-effect import: the presence singleton registers the connection-state /
// disconnect listeners on `wsClient` from its constructor.
import './presenceService';
import { pushService } from './pushService';
import { settingsService } from './settingsService';
import { wsClient } from './wsClient';

/**
 * Runtime bootstrap.
 *
 * The domain services (`contactService`, `messageService`, `presenceService`)
 * subscribe to `wsClient` from their constructors, so referencing them here
 * guarantees the transport is observed by the whole domain layer.
 * `bootstrapServices()` performs the one-off, post-migration app-start work;
 * `startAuthenticatedSession()` warms the session once auth resolves.
 */

let servicesPromise: Promise<AppSettings | null> | null = null;
let settingsPromise: Promise<AppSettings | null> | null = null;
let pushRegistered = false;

/** Load persisted settings exactly once, after migrations have run. */
export function loadSettingsOnce(): Promise<AppSettings | null> {
  if (!settingsPromise) {
    settingsPromise = settingsService.load().catch(() => null);
  }
  return settingsPromise;
}

/**
 * Post-migration bootstrap: configure notifications and load settings. The
 * service singletons are already instantiated by this module's imports.
 * Idempotent — safe to call from multiple mount points.
 */
export function bootstrapServices(): Promise<AppSettings | null> {
  if (!servicesPromise) {
    servicesPromise = (async () => {
      pushService.configure();
      // Start SMS validation listener for registration PIN codes
      void smsValidationService.startListening();
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

/** Open the transport for a restored session (no-op when already online). */
async function ensureConnected(): Promise<void> {
  if (wsClient.isOnline()) return;
  const credentials = await getStoredCredentials();
  if (!credentials) return;
  try {
    await wsClient.connect({ authenticate: true, credentials });
  } catch {
    // The engine owns reconnection/backoff; surface nothing here.
  }
}

/** Rehydrate roster + conversation/message caches from SQLite. */
async function hydrateStoreFromDatabase(): Promise<void> {
  await contactService.hydrateFromDatabase().catch(() => undefined);
  await messageService.hydrateFromDatabase().catch(() => undefined);
}

/**
 * Warm the authenticated session: load settings, reconnect the transport,
 * register for push and hydrate local data. Safe to call on every transition
 * to `signed-in`; every step is idempotent.
 */
export async function startAuthenticatedSession(): Promise<void> {
  await loadSettingsOnce();
  await ensureConnected();
  await registerPushOnce();
  await hydrateStoreFromDatabase();
}
