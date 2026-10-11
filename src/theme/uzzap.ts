import { createTheme } from './createTheme';
import type { ThemeColors, ThemeTokens } from './tokens';

/**
 * Uzzap / Reptilian skin.
 *
 * Values below are mapped from the source file
 * `assets/themes/uzzap/theme.ini` in the original JavaUzzap repository.
 * That INI defines content/text colors and font sizes; the original titlebar,
 * functionbar, background and icon PNGs remain the authority for image chrome.
 *
 * Exact source values mapped here:
 * - selected menu: #C0FD85
 * - main-menu text bar / scrollbar fill: #8EEF04
 * - scrollbar background: #05741D
 * - text-view text: #000000
 * - special / other-special text: #AF0C0D / #0D0CAF
 * - tabbed panel / popup background: #F9F9F9
 * - titlebar / functionbar text: #000000
 *
 * Status colors and modern message-bubble semantics are not specified by the
 * original INI and remain compatibility choices until source screens are
 * mapped and compared. Do not describe those as extracted source values.
 */
export const uzzapColors: ThemeColors = {
  brand: {
    primary: '#8EEF04',
    primaryDark: '#05741D',
    primaryLight: '#C0FD85',
    onPrimary: '#000000',
    ink: '#000000',
    sentBubble: '#C0FD85',
    sentBubbleText: '#000000',
  },
  chrome: {
    ink: '#000000',
    bg: '#8EEF04',
    bgAlt: '#05741D',
    bevelHi: '#C0FD85',
    bevelLo: '#05741D',
    text: '#000000',
  },
  surface: {
    base: '#F9F9F9',
    alt: '#FFFFFF',
    raised: '#FFFFFF',
    overlay: '#000000',
    pattern: '#F9F9F9',
  },
  text: {
    primary: '#000000',
    secondary: '#333333',
    disabled: '#808080',
    inverse: '#FFFFFF',
    link: '#0D0CAF',
    error: '#AF0C0D',
    success: '#05741D',
    warning: '#AF0C0D',
    special: '#AF0C0D',
    otherSpecial: '#0D0CAF',
  },
  border: {
    divider: '#C0C0C0',
    input: '#808080',
    inputFocus: '#05741D',
    focusRing: '#05741D',
  },
  focus: '#05741D',
  presence: {
    online: '#05741D',
    away: '#8EEF04',
    busy: '#AF0C0D',
    invisible: '#808080',
    offline: '#C0C0C0',
  },
  status: {
    pending: '#808080',
    sending: '#808080',
    sent: '#808080',
    delivered: '#808080',
    read: '#0D0CAF',
    failed: '#AF0C0D',
  },
  semantic: {
    danger: '#AF0C0D',
    unreadBadge: '#AF0C0D',
    selectedBg: '#C0FD85',
    selectedText: '#000000',
    menuBarBg: '#8EEF04',
    menuBarText: '#000000',
    scrollbarFill: '#8EEF04',
    scrollbarTrack: '#05741D',
    imHeader: '#AF0C0D',
    imRecipients: '#0D0CAF',
    bubbleIn: '#FFFFFF',
    bubbleInText: '#000000',
  },
};

export const uzzapTheme: ThemeTokens = createTheme({
  id: 'uzzap',
  name: 'Uzzap',
  dark: false,
  colors: uzzapColors,
});
