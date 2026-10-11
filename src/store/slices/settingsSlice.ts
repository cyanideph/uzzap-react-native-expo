import { DEFAULT_SETTINGS } from '../../types/models';
import type { AppSettings, ThemeId } from '../../types/models';
import type { UzzapSlice } from '../index';

/** Notification-relevant subset of {@link AppSettings}. */
export interface NotificationPreferences {
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  ledEnabled?: boolean;
  readReceipts?: boolean;
}

export interface SettingsSlice {
  /** Durable user preferences (persisted to AsyncStorage). */
  settings: AppSettings;

  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
  setTheme: (theme: ThemeId) => void;
  setDarkMode: (mode: AppSettings['darkMode']) => void;
  setNotificationPreferences: (patch: NotificationPreferences) => void;
  /** One-off onboarding flag. */
  setHasSeenIntro: (hasSeenIntro: boolean) => void;
}

export const createSettingsSlice: UzzapSlice<SettingsSlice> = (set) => ({
  settings: { ...DEFAULT_SETTINGS },

  updateSettings: (patch) =>
    set((state) => {
      state.settings = { ...state.settings, ...patch };
    }),

  resetSettings: () =>
    set((state) => {
      state.settings = { ...DEFAULT_SETTINGS };
    }),

  setTheme: (theme) =>
    set((state) => {
      state.settings.theme = theme;
    }),

  setDarkMode: (darkMode) =>
    set((state) => {
      state.settings.darkMode = darkMode;
    }),

  setNotificationPreferences: (patch) =>
    set((state) => {
      if (patch.soundEnabled !== undefined) state.settings.soundEnabled = patch.soundEnabled;
      if (patch.vibrationEnabled !== undefined) {
        state.settings.vibrationEnabled = patch.vibrationEnabled;
      }
      if (patch.ledEnabled !== undefined) state.settings.ledEnabled = patch.ledEnabled;
      if (patch.readReceipts !== undefined) state.settings.readReceipts = patch.readReceipts;
    }),

  setHasSeenIntro: (hasSeenIntro) =>
    set((state) => {
      state.settings.hasSeenIntro = hasSeenIntro;
    }),
});
