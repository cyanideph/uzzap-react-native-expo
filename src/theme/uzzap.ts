import { createTheme } from './createTheme';
import type { ThemeColors, ThemeTokens } from './tokens';

/**
 * Uzzap brand theme — orange on charcoal.
 *
 * Reconstructed from `JAVAUZZAP_UI_UX_SPEC.md` §2.1 (brand) and §1.1 (chrome,
 * content surfaces, presence, status). Exact spec values:
 *
 *   brand   primary #FF7A1A · primaryDark #D95E00 · primaryLight #FFA24D
 *   chrome  ink #14161A · bg #1E2228 · bevelHi #3A4048 · bevelLo #05070A · text #F5F7FA
 *   surface base #FFFFFF · alt #F2F4F7
 *   text    primary #0E1116 · secondary #5B6472 · disabled #9AA3B2
 *   border  divider #E3E7EE · focus #FFA24D
 *   presence online #2EE06A · away #FFB020 · busy #FF4D4F · invisible #8A93A2 · offline #C3C9D4
 *   status  sent/delivered #8A93A2 · read #22A7F0
 *   danger  #E5484D · unread badge #FF3B30
 */
export const uzzapColors: ThemeColors = {
  brand: {
    primary: '#FF7A1A',
    primaryDark: '#D95E00',
    primaryLight: '#FFA24D',
    onPrimary: '#14161A',
    ink: '#14161A',
    sentBubble: '#FFE7D6',
    sentBubbleText: '#0E1116',
  },
  chrome: {
    ink: '#14161A',
    bg: '#1E2228',
    bgAlt: '#14161A',
    bevelHi: '#3A4048',
    bevelLo: '#05070A',
    text: '#F5F7FA',
  },
  surface: {
    base: '#FFFFFF',
    alt: '#F2F4F7',
    raised: '#FFFFFF',
    overlay: '#05070A',
    pattern: '#14161A',
  },
  text: {
    primary: '#0E1116',
    secondary: '#5B6472',
    disabled: '#9AA3B2',
    inverse: '#F5F7FA',
    link: '#D95E00',
    error: '#E5484D',
    success: '#2EE06A',
    warning: '#FFB020',
    special: '#FF7A1A',
    otherSpecial: '#FFA24D',
  },
  border: {
    divider: '#E3E7EE',
    input: '#9AA3B2',
    inputFocus: '#FFA24D',
    focusRing: '#FFA24D',
  },
  focus: '#FFA24D',
  presence: {
    online: '#2EE06A',
    away: '#FFB020',
    busy: '#FF4D4F',
    invisible: '#8A93A2',
    offline: '#C3C9D4',
  },
  status: {
    pending: '#8A93A2',
    sending: '#8A93A2',
    sent: '#8A93A2',
    delivered: '#8A93A2',
    read: '#22A7F0',
    failed: '#E5484D',
  },
  semantic: {
    danger: '#E5484D',
    unreadBadge: '#FF3B30',
    selectedBg: '#FFF0E4',
    selectedText: '#14161A',
    menuBarBg: '#1E2228',
    menuBarText: '#F5F7FA',
    scrollbarFill: '#FF7A1A',
    scrollbarTrack: '#14161A',
    imHeader: '#FF7A1A',
    imRecipients: '#FFA24D',
    bubbleIn: '#F2F4F7',
    bubbleInText: '#0E1116',
  },
};

export const uzzapTheme: ThemeTokens = createTheme({
  id: 'uzzap',
  name: 'Uzzap',
  dark: false,
  colors: uzzapColors,
});
