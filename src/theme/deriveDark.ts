import { createTheme } from './createTheme';
import { withAlpha, type Hex, type ThemeColors, type ThemeTokens } from './tokens';

/* -------------------------------------------------------------------------- */
/* Color math                                                                 */
/* -------------------------------------------------------------------------- */

function hexToRgb(hex: Hex): [number, number, number] {
  const bare = hex.replace('#', '');
  return [
    parseInt(bare.slice(0, 2), 16),
    parseInt(bare.slice(2, 4), 16),
    parseInt(bare.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): Hex {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase() as Hex;
}

/** Move a colour toward black by `amount` (0..1). */
export function darken(hex: Hex, amount: number): Hex {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - Math.max(0, Math.min(1, amount));
  return rgbToHex(r * f, g * f, b * f);
}

/** Move a colour toward white by `amount` (0..1). */
export function lighten(hex: Hex, amount: number): Hex {
  const [r, g, b] = hexToRgb(hex);
  const f = Math.max(0, Math.min(1, amount));
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}

/** WCAG relative luminance (0..1). */
export function luminance(hex: Hex): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick black or white for maximum contrast against `bg`. */
export function readableTextOn(bg: Hex): Hex {
  return luminance(bg) > 0.45 ? '#000000' : '#FFFFFF';
}

export function contrastRatio(a: Hex, b: Hex): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* -------------------------------------------------------------------------- */
/* Dark derivation                                                            */
/* -------------------------------------------------------------------------- */

const DARK_SURFACE_BASE = '#0F1115' as Hex;
const DARK_SURFACE_ALT = '#1A1D23' as Hex;
const DARK_SURFACE_RAISED = '#16181D' as Hex;
const DARK_BEVEL_LO = '#05070A' as Hex;

/**
 * Derive a dark palette from any light theme. The chrome base is darkened,
 * content surfaces move to a near-black stack, and every status/bevel colour is
 * re-checked for readable text.
 */
export function deriveDarkColors(light: ThemeColors): ThemeColors {
  const primary = lighten(light.brand.primary, 0.06);
  const primaryDark = darken(light.brand.primary, 0.2);
  const primaryLight = lighten(light.brand.primary, 0.24);

  const chromeBg = darken(light.chrome.bg, 0.78);
  const chromeText = readableTextOn(chromeBg);
  const selectedBg = darken(light.semantic.selectedBg, 0.58);
  const menuBarBg = darken(light.semantic.menuBarBg, 0.82);
  const sentBubble = darken(light.brand.sentBubble, 0.8);

  return {
    brand: {
      primary,
      primaryDark,
      primaryLight,
      onPrimary: readableTextOn(primary),
      ink: '#0A0B0E',
      sentBubble,
      sentBubbleText: lighten(light.brand.sentBubbleText, 0.7),
    },
    chrome: {
      ink: '#05070A',
      bg: chromeBg,
      bgAlt: darken(light.chrome.bgAlt, 0.85),
      bevelHi: lighten(chromeBg, 0.18),
      bevelLo: DARK_BEVEL_LO,
      text: chromeText,
    },
    surface: {
      base: DARK_SURFACE_BASE,
      alt: DARK_SURFACE_ALT,
      raised: DARK_SURFACE_RAISED,
      overlay: '#000000',
      pattern: darken(light.surface.pattern, 0.72),
    },
    text: {
      primary: '#F2F4F7',
      secondary: '#A6AEBB',
      disabled: '#6B7280',
      inverse: '#0E1116',
      link: lighten(light.text.link, 0.35),
      error: lighten(light.text.error, 0.18),
      success: lighten(light.text.success, 0.2),
      warning: lighten(light.text.warning, 0.12),
      special: lighten(light.text.special, 0.22),
      otherSpecial: lighten(light.text.otherSpecial, 0.32),
    },
    border: {
      divider: '#2A2F37',
      input: '#3A4048',
      inputFocus: primary,
      focusRing: primaryLight,
    },
    focus: primaryLight,
    presence: {
      online: lighten(light.presence.online, 0.06),
      away: lighten(light.presence.away, 0.06),
      busy: lighten(light.presence.busy, 0.1),
      invisible: '#8A93A2',
      offline: '#5B6472',
    },
    status: {
      pending: '#8A93A2',
      sending: '#8A93A2',
      sent: '#A6AEBB',
      delivered: '#A6AEBB',
      read: lighten(light.status.read, 0.12),
      failed: lighten(light.status.failed, 0.12),
    },
    semantic: {
      danger: lighten(light.semantic.danger, 0.1),
      unreadBadge: light.semantic.unreadBadge,
      selectedBg,
      selectedText: readableTextOn(selectedBg),
      menuBarBg,
      menuBarText: readableTextOn(menuBarBg),
      scrollbarFill: darken(light.semantic.scrollbarFill, 0.55),
      scrollbarTrack: darken(light.semantic.scrollbarTrack, 0.8),
      imHeader: lighten(light.semantic.imHeader, 0.22),
      imRecipients: lighten(light.semantic.imRecipients, 0.32),
      bubbleIn: DARK_SURFACE_ALT,
      bubbleInText: '#F2F4F7',
    },
  };
}

export function deriveDark(light: ThemeTokens): ThemeTokens {
  const colors = deriveDarkColors(light.colors);
  return createTheme({
    id: light.id,
    name: `${light.name} Dark`,
    dark: true,
    colors,
    rawThemeIni: light.rawThemeIni,
  });
}

/** A translucent scrim over content (used by sheets/modals). */
export function scrim(theme: ThemeTokens, alpha = 0.4): string {
  return withAlpha(theme.colors.surface.overlay, alpha);
}
