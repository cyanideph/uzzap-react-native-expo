import { createTheme } from './createTheme';
import type { ThemeColors, ThemeTokens } from './tokens';

/**
 * Default MIDP system theme.
 *
 * Source-backed mappings from the original `themes/default/theme.ini`:
 * selected menu #B6B6B6; main-menu bar #DFDFDF; scrollbar fill #868686 and
 * track #DFDFDF; text #000000; special/other-special #AF0C0D / #0D0CAF;
 * tabbed/popup background #FFFFFF; title/function bar text #FFFFFF.
 *
 * The original titlebar/functionbar image slices are rendered by the shared
 * chrome components. Presence and message-status semantics not specified by
 * the INI remain compatibility choices, not historical source values.
 */
export const defaultColors: ThemeColors = {
  brand: {
    primary: '#868686',
    primaryDark: '#666666',
    primaryLight: '#B6B6B6',
    onPrimary: '#000000',
    ink: '#000000',
    sentBubble: '#DFDFDF',
    sentBubbleText: '#000000',
  },
  chrome: {
    ink: '#000000',
    bg: '#DFDFDF',
    bgAlt: '#868686',
    bevelHi: '#FFFFFF',
    bevelLo: '#868686',
    text: '#FFFFFF',
  },
  surface: {
    base: '#FFFFFF',
    alt: '#DFDFDF',
    raised: '#FFFFFF',
    overlay: '#000000',
    pattern: '#FFFFFF',
  },
  text: {
    primary: '#000000',
    secondary: '#404040',
    disabled: '#808080',
    inverse: '#FFFFFF',
    link: '#0D0CAF',
    error: '#AF0C0D',
    success: '#008000',
    warning: '#AF0C0D',
    special: '#AF0C0D',
    otherSpecial: '#0D0CAF',
  },
  border: {
    divider: '#DFDFDF',
    input: '#868686',
    inputFocus: '#868686',
    focusRing: '#B6B6B6',
  },
  focus: '#B6B6B6',
  presence: {
    online: '#008000',
    away: '#B6B6B6',
    busy: '#AF0C0D',
    invisible: '#868686',
    offline: '#868686',
  },
  status: {
    pending: '#868686',
    sending: '#868686',
    sent: '#868686',
    delivered: '#868686',
    read: '#0D0CAF',
    failed: '#AF0C0D',
  },
  semantic: {
    danger: '#AF0C0D',
    unreadBadge: '#AF0C0D',
    selectedBg: '#B6B6B6',
    selectedText: '#000000',
    menuBarBg: '#DFDFDF',
    menuBarText: '#000000',
    scrollbarFill: '#868686',
    scrollbarTrack: '#DFDFDF',
    imHeader: '#AF0C0D',
    imRecipients: '#0D0CAF',
    bubbleIn: '#FFFFFF',
    bubbleInText: '#000000',
  },
};

export const defaultTheme: ThemeTokens = createTheme({
  id: 'default',
  name: 'Default',
  dark: false,
  colors: defaultColors,
});
