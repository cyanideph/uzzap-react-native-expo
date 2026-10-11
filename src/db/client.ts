import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';

import { schema } from './schema';

/** On-device SQLite database filename. */
export const DATABASE_NAME = 'uzzap.db';

/**
 * Synchronous Expo SQLite handle. `openDatabaseSync` is available in
 * expo-sqlite v14+ (SDK 51+). WAL + FK enforcement are enabled up front so
 * cascade deletes on conversations/messages work as declared in `schema.ts`.
 */
export const expoDb = SQLite.openDatabaseSync(DATABASE_NAME, {
  enableChangeListener: true,
});

expoDb.execSync('PRAGMA journal_mode = WAL;');
expoDb.execSync('PRAGMA foreign_keys = ON;');
expoDb.execSync('PRAGMA busy_timeout = 5000;');

/** Typed Drizzle client. */
export const db = drizzle(expoDb, { schema });

export type DrizzleDb = typeof db;
export type DbTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/** Reset all local data (used by "Delete account" / logout-with-wipe). */
export function resetDatabase(): void {
  expoDb.execSync('PRAGMA foreign_keys = OFF;');
  // Children before parents so the ordered deletes are portable even with FK
  // enforcement temporarily disabled.
  for (const table of ['messages', 'conversations', 'buddies', 'users', 'settings']) {
    expoDb.execSync(`DELETE FROM ${table};`);
  }
  expoDb.execSync('PRAGMA foreign_keys = ON;');
}

export { schema };
