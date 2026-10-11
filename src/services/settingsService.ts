import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { settings as settingsTable } from '../db/schema';
import { hotKV } from '../storage/mmkv';
import {
  getString,
  PREF_KEYS,
  removeString,
  setJSON,
  setString,
  getJSON,
} from '../storage/preferences';
import { useUzzapStore } from '../store';
import { DEFAULT_SETTINGS } from '../types/models';
import type { AppSettings, ThemeId } from '../types/models';

/**
 * Preferences + theme persistence.
 *
 * Settings live in AsyncStorage (`uzzap.settings`) for cheap, non-sensitive
 * access, mirrored into the SQLite `settings` table for durability and into
 * MMKV for the render-time hot path (theme mode). The zustand settings slice
 * stays the single source of truth for the UI.
 */

const DB_SETTINGS_KEY = 'app';

export class SettingsService {
  getSettings(): AppSettings {
    return useUzzapStore.getState().settings;
  }

  /** Load persisted settings, merging defaults + legacy theme keys. */
  async load(): Promise<AppSettings> {
    const [stored, theme, mode, dbStored] = await Promise.all([
      getJSON<Partial<AppSettings>>(PREF_KEYS.settings),
      getString(PREF_KEYS.themeId),
      getString(PREF_KEYS.themeMode),
      this.loadFromDatabase(),
    ]);

    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...(dbStored ?? {}),
      ...(stored ?? {}),
    };

    if (theme) merged.theme = theme as ThemeId;
    if (mode === 'light' || mode === 'dark' || mode === 'system') merged.darkMode = mode;

    this.apply(merged);
    return merged;
  }

  async save(settings: AppSettings): Promise<void> {
    this.apply(settings);
    await Promise.all([
      setJSON(PREF_KEYS.settings, settings),
      setString(PREF_KEYS.themeId, settings.theme),
      setString(PREF_KEYS.themeMode, settings.darkMode),
      setString(PREF_KEYS.hasSeenIntro, settings.hasSeenIntro ? 'true' : 'false'),
      this.saveToDatabase(settings),
    ]);
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const merged = { ...this.getSettings(), ...patch };
    await this.save(merged);
    return merged;
  }

  async setTheme(theme: ThemeId, mode?: AppSettings['darkMode']): Promise<void> {
    await this.update(mode ? { theme, darkMode: mode } : { theme });
  }

  getTheme(): { theme: ThemeId; darkMode: AppSettings['darkMode'] } {
    const settings = this.getSettings();
    return { theme: settings.theme, darkMode: settings.darkMode };
  }

  async setHasSeenIntro(hasSeenIntro: boolean): Promise<void> {
    await this.update({ hasSeenIntro });
  }

  async reset(): Promise<void> {
    await this.save({ ...DEFAULT_SETTINGS });
    await removeString(PREF_KEYS.settings);
  }

  async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    await this.update({ [key]: value } as Partial<AppSettings>);
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private apply(settings: AppSettings): void {
    useUzzapStore.getState().updateSettings(settings);
    hotKV.set('theme.mode', settings.darkMode);
    hotKV.set('theme.id', settings.theme);
  }

  private async saveToDatabase(settings: AppSettings): Promise<void> {
    const value = JSON.stringify(settings);
    await db
      .insert(settingsTable)
      .values({ key: DB_SETTINGS_KEY, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value } })
      .run();
  }

  private async loadFromDatabase(): Promise<Partial<AppSettings> | null> {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, DB_SETTINGS_KEY))
      .all();
    const row = rows[0];
    if (!row) return null;
    try {
      return JSON.parse(row.value) as Partial<AppSettings>;
    } catch {
      return null;
    }
  }
}

export const settingsService = new SettingsService();

export const loadSettings = (): Promise<AppSettings> => settingsService.load();
export const saveSettings = (settings: AppSettings): Promise<void> =>
  settingsService.save(settings);
export const updateSettings = (patch: Partial<AppSettings>): Promise<AppSettings> =>
  settingsService.update(patch);
export const setTheme = (theme: ThemeId, mode?: AppSettings['darkMode']): Promise<void> =>
  settingsService.setTheme(theme, mode);
