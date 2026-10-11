import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit config for the Uzzap Expo SQLite database.
 *
 * `drizzle-kit generate` emits SQL migrations into ./drizzle that are bundled
 * into the app via `babel-plugin-inline-import` and applied with
 * `useMigrations()` from `drizzle-orm/expo-sqlite/migrator`.
 */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
  verbose: true,
  strict: true,
} satisfies Config;
