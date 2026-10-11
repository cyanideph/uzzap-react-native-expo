/**
 * Design tokens — Uzzap React Native.
 *
 * This module is the single source of truth for *shape* and *scale*: the
 * semantic colour type, spacing/type/radius/shadow scales, layout metrics and
 * the small colour helpers used across themes.
 *
 * Concrete palettes live in `./uzzap` (original Reptilian skin values where source-backed)
 * and `./default` (original MIDP system theme values where source-backed). Components must consume the
 * semantic tokens from `useTheme()` — never raw hex — so a theme swap is just a
 * context-value change.
 *
 * Derived from `JAVAUZZAP_UI_UX_SPEC.md` §1 (tokens) + §2 (per-theme palette).
 */

import type { ViewStyle } from 'react-native';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

/** A 6-digit `#RRGGBB` colour. All palette values are normalised to this. */
export type Hex = `#${string}`;

/** Stable theme identifiers used by the registry / persistence. */
export type ThemeId = 'uzzap' | 'default' | 'custom';

/** User-facing theme choices. `system` follows the OS appearance. */
export type ThemeName = 'uzzap' | 'default' | 'system';

/** Resolved light/dark appearance. */
export type ThemeVariant = 'light' | 'dark';

/** Appearance preference selected by the user. */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * 4px base spacing unit. Named steps follow the spec scale
 * (4 / 8 / 12 / 16 / 24 / 32).
 */
export const space = {
  none: 0,
  unit: 4,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

/** Radii: sharp (`0`) for chrome, 4–8 for content cards. */
export const radius = {
  none: 0,
  chrome: 0,
  xs: 2,
  sm: 4,
  md: 6,
  card: 8,
  lg: 12,
  bubble: 16,
  sheet: 16,
  fab: 16,
  pill: 999,
  badge: 999,
  presence: 999,
} as const;

export const stroke = {
  hairline: 1,
  bevel: 1,
  focus: 2,
  avatarRing: 1.5,
} as const;

/** Typography scale — 12–18px body range, bitmap-style chrome, 10–28 scale. */
export interface TypeScale {
  xxs: number;
  xs: number;
  sm: number;
  bodySm: number;
  body: number;
  md: number;
  bodyLg: number;
  lg: number;
  xl: number;
  xxl: number;
  wordmark: number;
  emoticonLarge: number;
}

export const fontSize: TypeScale = {
  xxs: 10,
  xs: 11,
  sm: 12,
  bodySm: 13,
  body: 14,
  md: 15,
  bodyLg: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  wordmark: 28,
  emoticonLarge: 44,
};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
  message: 1.5,
  listItem: 1.3,
} as const;

/**
 * Font roles. J2ME used bitmap fonts; the spec maps chrome/headings to a
 * pixel/display face and body copy to a system sans. `FontRegistry` (loaded by
 * the app once `expo-font` resolves) swaps these for bundled `.ttf`s.
 */
export const fontFamily = {
  /** Angular chrome: title bars, headings, buttons. */
  display: 'Oxanium_700Bold',
  displayRegular: 'Oxanium_600SemiBold',
  /** Body / list names. */
  body: 'IBMPlexSans_500Medium',
  bodyRegular: 'IBMPlexSans_400Regular',
  /** Timestamps / counters. */
  mono: 'IBMPlexMono_500Medium',
  /** Pixel accents: badges, ticks, wordmark. */
  pixel: 'Silkscreen_400Regular',
  pixelBold: 'Silkscreen_700Bold',
  /** Platform fallbacks used before custom fonts load. */
  system: 'System',
  systemMono: 'monospace',
} as const;

export const iconSize = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 42,
  xxl: 64,
} as const;

/** Animation durations (ms). */
export const duration = {
  instant: 0,
  fast: 120,
  base: 180,
  normal: 240,
  slow: 320,
  themeFade: 300,
} as const;

export const easing = {
  easeOutCubic: 'ease-out-cubic',
  easeOutQuad: 'ease-out-quad',
  easeInOut: 'ease-in-out',
  linear: 'linear',
} as const;

/** Elevation order for absolutely-positioned chrome. */
export const zIndex = {
  content: 0,
  functionbar: 10,
  titlebar: 10,
  fab: 20,
  sheetScrim: 90,
  sheet: 91,
  toast: 100,
  modal: 110,
} as const;

/** Retro fixed chrome metrics (J2ME-inspired, 9-patch safe). */
export interface LayoutTokens {
  titleBarHeight: number;
  functionBarHeight: number;
  menuBottomBarHeight: number;
  presenceStripHeight: number;
  sectionHeaderHeight: number;
  searchBarHeight: number;
  buddyRowHeight: number;
  settingsRowHeight: number;
  inputHeight: number;
  avatarSm: number;
  avatarMd: number;
  avatarLg: number;
  fabSize: number;
  gutterScreen: number;
  contentInset: number;
  listRowPaddingH: number;
  listRowPaddingV: number;
  cardPadding: number;
  sheetPadding: number;
  minTouchTarget: number;
}

export const layout: LayoutTokens = {
  titleBarHeight: 28,
  functionBarHeight: 26,
  menuBottomBarHeight: 22,
  presenceStripHeight: 32,
  sectionHeaderHeight: 24,
  searchBarHeight: 40,
  buddyRowHeight: 64,
  settingsRowHeight: 52,
  inputHeight: 44,
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 64,
  fabSize: 56,
  gutterScreen: 8,
  contentInset: 6,
  listRowPaddingH: 10,
  listRowPaddingV: 6,
  cardPadding: 12,
  sheetPadding: 16,
  minTouchTarget: 44,
};

export const breakpoint = {
  small: 240,
  medium: 320,
  large: 480,
} as const;

/**
 * Shadow presets. Chrome uses 1px hard bevels (no blur); content cards use a
 * subtle blur. `elevation` mirrors these on Android.
 */
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  chrome: {
    shadowColor: '#05070A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 1,
  },
  card: {
    shadowColor: '#0E1116',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 2,
  },
  sheet: {
    shadowColor: '#05070A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  fab: {
    shadowColor: '#05070A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
} as const satisfies Record<string, ViewStyle>;

export type ThemeShadows = typeof shadows;

/* -------------------------------------------------------------------------- */
/* Semantic theme types                                                       */
/* -------------------------------------------------------------------------- */

export interface ThemeColors {
  brand: {
    primary: Hex;
    primaryDark: Hex;
    primaryLight: Hex;
    /** Text/icon colour that sits on top of `primary`. */
    onPrimary: Hex;
    /** Deep ink used for brand wordmark / dark accents. */
    ink: Hex;
    /** Solid tint behind sent message bubbles. */
    sentBubble: Hex;
    sentBubbleText: Hex;
  };
  chrome: {
    /** Deepest chrome ink (status bar / bevel shadow). */
    ink: Hex;
    /** Main title bar / function bar background. */
    bg: Hex;
    /** Secondary chrome background. */
    bgAlt: Hex;
    /** Raised 1px bevel highlight. */
    bevelHi: Hex;
    /** Recessed 1px bevel shadow. */
    bevelLo: Hex;
    /** Chrome label colour. */
    text: Hex;
  };
  surface: {
    base: Hex;
    alt: Hex;
    raised: Hex;
    overlay: Hex;
    /** Background tile behind splash / empty states. */
    pattern: Hex;
  };
  text: {
    primary: Hex;
    secondary: Hex;
    disabled: Hex;
    inverse: Hex;
    link: Hex;
    error: Hex;
    success: Hex;
    warning: Hex;
    special: Hex;
    otherSpecial: Hex;
  };
  border: {
    divider: Hex;
    input: Hex;
    inputFocus: Hex;
    focusRing: Hex;
  };
  /** Focus outline colour (mirrors `border.focusRing`). */
  focus: Hex;
  presence: {
    online: Hex;
    away: Hex;
    busy: Hex;
    invisible: Hex;
    offline: Hex;
  };
  status: {
    pending: Hex;
    sending: Hex;
    sent: Hex;
    delivered: Hex;
    read: Hex;
    failed: Hex;
  };
  semantic: {
    danger: Hex;
    unreadBadge: Hex;
    selectedBg: Hex;
    selectedText: Hex;
    menuBarBg: Hex;
    menuBarText: Hex;
    scrollbarFill: Hex;
    scrollbarTrack: Hex;
    imHeader: Hex;
    imRecipients: Hex;
    /** Received bubble fill / text. */
    bubbleIn: Hex;
    bubbleInText: Hex;
  };
}

export interface ThemeTypography {
  family: typeof fontFamily;
  size: typeof fontSize;
  weight: typeof fontWeight;
  lineHeight: typeof lineHeight;
}

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  dark: boolean;
  colors: ThemeColors;
  typography: ThemeTypography;
  space: typeof space;
  radius: typeof radius;
  stroke: typeof stroke;
  iconSize: typeof iconSize;
  duration: typeof duration;
  easing: typeof easing;
  zIndex: typeof zIndex;
  layout: typeof layout;
  breakpoint: typeof breakpoint;
  shadows: ThemeShadows;
  /** Unknown/forward-compat keys retained from a parsed theme.ini. */
  rawThemeIni: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* Raw theme.ini surface                                                      */
/* -------------------------------------------------------------------------- */

export interface RawThemeIni {
  /** Every key=value pair, lower-cased keys, comments stripped. */
  entries: Record<string, string>;
  /** `kt.*`/`kalypte.*` color keys normalised to bare names. */
  colors: Record<string, Hex>;
  /** `*.font` keys coerced to numbers. */
  fonts: Record<string, number>;
  /** `*.image`/asset references (filename only). */
  images: Record<string, string>;
  /** Keys we could not classify — preserved for forward-compat. */
  unknown: Record<string, string>;
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Normalise a theme.ini color (`8EEF04`, `#8eef04`, `0x8EEF04`) to `#RRGGBB`. */
export function normalizeHex(input: string): Hex | null {
  let value = input.trim();
  if (value.startsWith('0x') || value.startsWith('0X')) value = value.slice(2);
  if (!HEX_RE.test(value)) return null;
  const bare = value.replace('#', '');
  if (bare.length === 3) {
    return `#${bare[0]}${bare[0]}${bare[1]}${bare[1]}${bare[2]}${bare[2]}`.toUpperCase() as Hex;
  }
  // Drop alpha if 8-digit (theme.ini RRGGBBAA is uncommon; keep RGB).
  return `#${bare.slice(0, 6)}`.toUpperCase() as Hex;
}

/** Convert a `#RRGGBB` colour to an `rgba()` string with the given alpha. */
export function withAlpha(hex: Hex, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const bare = hex.replace('#', '');
  const r = parseInt(bare.slice(0, 2), 16);
  const g = parseInt(bare.slice(2, 4), 16);
  const b = parseInt(bare.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Overrides layered onto a base theme by `mergeTheme`. */
export interface ThemeOverrides {
  id?: ThemeId;
  name?: string;
  dark?: boolean;
  colors?: DeepPartial<ThemeColors>;
  layout?: Partial<typeof layout>;
  fontSize?: Partial<typeof fontSize>;
  rawThemeIni?: Record<string, string>;
}

function mergeColorGroup<T extends Record<string, Hex>>(base: T, override: DeepPartial<T>): T {
  return { ...base, ...override } as T;
}

/** Deep-merge a partial colour map onto a base `ThemeColors`. */
export function mergeColors(base: ThemeColors, overrides: DeepPartial<ThemeColors>): ThemeColors {
  const out = { ...base } as unknown as Record<string, unknown>;
  (Object.keys(overrides) as (keyof ThemeColors)[]).forEach((key) => {
    const overrideValue = overrides[key];
    if (overrideValue === undefined) return;
    const baseValue = base[key];
    if (
      typeof overrideValue === 'object' &&
      overrideValue !== null &&
      typeof baseValue === 'object'
    ) {
      out[key] = mergeColorGroup(
        baseValue as unknown as Record<string, Hex>,
        overrideValue as unknown as DeepPartial<Record<string, Hex>>,
      );
    } else {
      out[key] = overrideValue;
    }
  });
  return out as unknown as ThemeColors;
}

/** Merge partial overrides onto a base theme (used by theme.ini + custom skins). */
export function mergeTheme(base: ThemeTokens, overrides: ThemeOverrides): ThemeTokens {
  return {
    ...base,
    id: overrides.id ?? base.id,
    name: overrides.name ?? base.name,
    dark: overrides.dark ?? base.dark,
    colors: overrides.colors ? mergeColors(base.colors, overrides.colors) : base.colors,
    layout: overrides.layout ? { ...base.layout, ...overrides.layout } : base.layout,
    typography: overrides.fontSize
      ? { ...base.typography, size: { ...base.typography.size, ...overrides.fontSize } }
      : base.typography,
    rawThemeIni: overrides.rawThemeIni ?? base.rawThemeIni,
  };
}
