import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '../../drizzle/migrations/migrations';
import { db } from './client';

export interface MigrationState {
  success: boolean;
  error?: Error;
}

/**
 * Apply bundled Drizzle migrations on app start. Call once in the root layout
 * before rendering data-dependent screens.
 */
export function useUzzapMigrations(): MigrationState {
  return useMigrations(db, migrations);
}

export { migrations };
