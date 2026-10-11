import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { PREF_KEYS } from '../storage/preferences';
import { DEFAULT_THEME_NAME, getDarkTheme, getLightTheme, resolveBrand } from './registry';
import type { ThemeColors, ThemeMode, ThemeName, ThemeTokens } from './tokens';

/** The `system` pseudo-theme resolves to the app brand and follows the OS. */
export const SYSTEM_THEME: ThemeName = 'system';

export interface ThemeContextValue {
  /** Fully resolved tokens for the current brand + appearance. */
  theme: ThemeTokens;
  /** Convenience alias for `theme.colors`. */
  colors: ThemeColors;
  /** User selection — may be `system`. */
  themeName: ThemeName;
  /** Resolved concrete brand (`system` -> `uzzap`). */
  brand: 'uzzap' | 'default';
  /** Appearance preference. */
  mode: ThemeMode;
  /** Resolved appearance after applying the OS scheme. */
  isDark: boolean;
  /** False until persisted preferences have been hydrated. */
  hydrated: boolean;
  /** Select a theme: `uzzap`, `default` or `system`. */
  setTheme: (name: ThemeName) => void;
  /** Select an appearance independently of the brand. */
  setMode: (mode: ThemeMode) => void;
  /** Flip between explicit light and dark. */
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY_NAME = PREF_KEYS.themeId;
const STORAGE_KEY_MODE = PREF_KEYS.themeMode;

function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === 'uzzap' || value === 'default' || value === 'system';
}

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export interface ThemeProviderProps extends PropsWithChildren {
  /** Theme selected before storage hydrates. */
  initialTheme?: ThemeName;
  /** Appearance selected before storage hydrates. */
  initialMode?: ThemeMode;
}

/**
 * Theme context provider.
 *
 * Persists the selected theme + appearance to AsyncStorage, follows the OS
 * scheme when `mode === 'system'`, and derives dark tokens from the light
 * palette for every brand.
 */
export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME_NAME,
  initialMode = 'system',
}: ThemeProviderProps): React.ReactElement {
  const systemScheme = useColorScheme();
  const [themeName, setThemeNameState] = useState<ThemeName>(initialTheme);
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate persisted preferences before the first meaningful paint.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [storedName, storedMode] = await AsyncStorage.multiGet([
          STORAGE_KEY_NAME,
          STORAGE_KEY_MODE,
        ]);
        if (!active) return;
        const name = storedName?.[1];
        const storedModeValue = storedMode?.[1];
        if (isThemeName(name)) setThemeNameState(name);
        if (isThemeMode(storedModeValue)) setModeState(storedModeValue);
      } catch {
        // Storage unavailable — fall back to defaults.
      } finally {
        if (active) setHydrated(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const brand = resolveBrand(themeName);

  const theme = useMemo(
    () => (isDark ? getDarkTheme(brand) : getLightTheme(brand)),
    [brand, isDark],
  );

  const setTheme = useCallback((name: ThemeName) => {
    setThemeNameState(name);
    void AsyncStorage.setItem(STORAGE_KEY_NAME, name).catch(() => undefined);
    // Choosing the `system` theme implies following the OS appearance.
    if (name === SYSTEM_THEME) {
      setModeState('system');
      void AsyncStorage.setItem(STORAGE_KEY_MODE, SYSTEM_THEME).catch(() => undefined);
    }
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY_MODE, next).catch(() => undefined);
  }, []);

  const toggleDark = useCallback(() => {
    setModeState((prev) => {
      const currentlyDark = prev === 'dark' || (prev === 'system' && systemScheme === 'dark');
      const next: ThemeMode = currentlyDark ? 'light' : 'dark';
      void AsyncStorage.setItem(STORAGE_KEY_MODE, next).catch(() => undefined);
      return next;
    });
  }, [systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: theme.colors,
      themeName,
      brand,
      mode,
      isDark,
      hydrated,
      setTheme,
      setMode,
      toggleDark,
    }),
    [theme, themeName, brand, mode, isDark, hydrated, setTheme, setMode, toggleDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access resolved tokens and theme controls. Must be used within a provider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() must be used within a <ThemeProvider>.');
  }
  return ctx;
}

/**
 * Memoised `StyleSheet.create`-style factory bound to the current theme.
 *
 * ```ts
 * const styles = useThemedStyles((t) => ({ row: { backgroundColor: t.colors.surface.base } }));
 * ```
 */
export function useThemedStyles<T extends Record<string, object>>(
  factory: (theme: ThemeTokens) => T,
): T {
  const { theme } = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}

/** Convenience: just the colour tokens. */
export function useThemeColors(): ThemeColors {
  return useTheme().theme.colors;
}
