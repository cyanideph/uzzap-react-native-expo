import { defaultTheme } from './default';
import { deriveDark } from './deriveDark';
import type { ThemeId, ThemeName, ThemeTokens } from './tokens';
import { uzzapTheme } from './uzzap';

/**
 * Theme registry. Light palettes ship pre-computed; dark variants are derived
 * algorithmically (`deriveDark`) so every theme gets a coherent dark mode.
 * The `system` pseudo-theme resolves to the app brand and follows the OS
 * appearance (handled in `ThemeProvider`).
 */

/** Concrete brand themes (excluding the `system` pseudo-theme). */
export const uzzap: ThemeTokens = uzzapTheme;
export const standard: ThemeTokens = defaultTheme;

/** Light (base) themes keyed by the concrete brand id. */
export const lightThemes: Record<'uzzap' | 'default', ThemeTokens> = {
  uzzap,
  default: standard,
};

/** All shipped themes, light + derived dark. */
export const allThemes: ThemeTokens[] = [uzzap, standard, deriveDark(uzzap), deriveDark(standard)];

/** Concrete brand ids, in presentation order. */
export const THEME_IDS: ReadonlyArray<'uzzap' | 'default'> = ['uzzap', 'default'];

/** User-facing theme choices. */
export const THEME_NAMES: ReadonlyArray<ThemeName> = ['uzzap', 'default', 'system'];

export const DEFAULT_THEME_ID: ThemeId = 'uzzap';
export const DEFAULT_THEME_NAME: ThemeName = 'uzzap';

/** Map a `ThemeName` (which may be `system`) to a concrete brand id. */
export function resolveBrand(name: ThemeName | ThemeId): 'uzzap' | 'default' {
  return name === 'default' ? 'default' : 'uzzap';
}

/** Light/base tokens for a theme name or id. */
export function getLightTheme(name: ThemeName | ThemeId): ThemeTokens {
  return resolveBrand(name) === 'default' ? standard : uzzap;
}

/** Dark tokens for a theme name or id. */
export function getDarkTheme(name: ThemeName | ThemeId): ThemeTokens {
  return deriveDark(getLightTheme(name));
}

/** Resolve tokens for a concrete variant. */
export function getTheme(name: ThemeName | ThemeId, dark = false): ThemeTokens {
  return dark ? getDarkTheme(name) : getLightTheme(name);
}
