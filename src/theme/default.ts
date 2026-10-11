import { createTheme } from './createTheme';
import type { ThemeColors, ThemeTokens } from './tokens';

/**
 * Default theme — the MIDP "silver / steel-blue Java phone" look.
 *
 * Reconstructed from `JAVAUZZAP_UI_UX_SPEC.md` §2.2 (Default) plus the legacy
 * fallbacks documented for `themes/default/theme.ini` (which ships empty):
 * menu selected #B6B6B6, title/function bar text #FFFFFF, main-menu text bar
 * #DFDFDF, scrollbar #868686 on #DFDFDF.
 */
export const defaultColors: ThemeColors = {
  brand: {
    primary: '#4A6FA5',
    primaryDark: '#33507E',
    primaryLight: '#8FB0DE',
    onPrimary: '#FFFFFF',
    ink: '#1E2E45',
    sentBubble: '#DCE7F5',
    sentBubbleText: '#0A0F18',
  },
  chrome: {
    ink: '#0A0F18',
    bg: '#3E5C82',
    bgAlt: '#33507E',
    bevelHi: '#7FA0CC',
    bevelLo: '#1E2E45',
    text: '#FFFFFF',
  },
  surface: {
    base: '#FFFFFF',
    alt: '#EAF0F8',
    raised: '#F7FAFD',
    overlay: '#0A0F18',
    pattern: '#3E5C82',
  },
  text: {
    primary: '#0A0F18',
    secondary: '#5B6472',
    disabled: '#9AA3B2',
    inverse: '#FFFFFF',
    link: '#0D0CAF',
    error: '#AF0C0D',
    success: '#008000',
    warning: '#FF8C00',
    special: '#AF0C0D',
    otherSpecial: '#0D0CAF',
  },
  border: {
    divider: '#D9DEE7',
    input: '#868686',
    inputFocus: '#4A6FA5',
    focusRing: '#8FB0DE',
  },
  focus: '#8FB0DE',
  presence: {
    online: '#008000',
    away: '#FF8C00',
    busy: '#AF0C0D',
    invisible: '#8A93A2',
    offline: '#868686',
  },
  status: {
    pending: '#868686',
    sending: '#868686',
    sent: '#868686',
    delivered: '#868686',
    read: '#3366CC',
    failed: '#AF0C0D',
  },
  semantic: {
    danger: '#AF0C0D',
    unreadBadge: '#D0021B',
    selectedBg: '#B6B6B6',
    selectedText: '#FFFFFF',
    menuBarBg: '#DFDFDF',
    menuBarText: '#000000',
    scrollbarFill: '#868686',
    scrollbarTrack: '#DFDFDF',
    imHeader: '#AF0C0D',
    imRecipients: '#0D0CAF',
    bubbleIn: '#EAF0F8',
    bubbleInText: '#0A0F18',
  },
};

export const defaultTheme: ThemeTokens = createTheme({
  id: 'default',
  name: 'Default',
  dark: false,
  colors: defaultColors,
});
