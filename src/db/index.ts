import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '../../drizzle/migrations/migrations';
import { db } from './client';

/**
 * Database entry point.
 *
 * `./client` owns the synchronous SQLite handle + typed Drizzle client;
 * this module exposes the connection surface and the migration runner so
 * callers can simply `import { db, migrateDatabase } from '@/db'`.
 */
export * from './schema';
// `./client` re-exports `schema` for its own convenience; re-export its public
// surface explicitly here so `schema` is only exported once (via `./schema`).
export { DATABASE_NAME, db, expoDb, resetDatabase } from './client';
export type { DbTransaction, DrizzleDb } from './client';
export * from './useMigrations';

/**
 * Apply all pending, bundled Drizzle migrations. Safe to call more than once
 * (already-applied migrations are skipped via the `__drizzle_migrations`
 * table). Prefer {@link useUzzapMigrations} inside React; use this in
 * non-React bootstrapping (e.g. background tasks).
 */
export async function migrateDatabase(): Promise<void> {
  await migrate(db, migrations);
}
