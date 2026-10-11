import {
  mergeTheme,
  normalizeHex,
  type DeepPartial,
  type Hex,
  type LayoutTokens,
  type ThemeColors,
  type ThemeTokens,
  type TypeScale,
} from './tokens';
import { uzzapThemeIni } from './sources';

/* -------------------------------------------------------------------------- */
/* Parser                                                                     */
/* -------------------------------------------------------------------------- */

const COMMENT_PREFIXES = [';', '#'];

/** Sectioned `theme.ini`, e.g.
 *
 * ```ini
 * [colors]
 * brand_primary = #FF7A1A
 *
 * [metrics]
 * titlebar_height = 28
 * ```
 */
export interface ParsedThemeIni {
  /** Section name -> raw key/value pairs (keys lower-cased). */
  sections: Record<string, Record<string, string>>;
  /** Flattened `section.key` / bare key -> value, insertion-ordered. */
  entries: Record<string, string>;
  /** Flattened keys in file order. */
  keys: string[];
  /** Non-fatal parse notes. */
  warnings: string[];
}

/** Normalise a key: lower-case, `.`/`-`/spaces to `_`, collapse repeats. */
function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Parse a `theme.ini` file. Supports both the modern sectioned form
 * (`[colors]` / `[metrics]` / `[fonts]`) and the legacy flat dotted form
 * (`kt.menu.selected.color=...`). Lines beginning with `;` or `#` are comments.
 */
export function parseThemeIni(raw: string): ParsedThemeIni {
  const sections: Record<string, Record<string, string>> = {};
  const entries: Record<string, string> = {};
  const keys: string[] = [];
  const warnings: string[] = [];

  let currentSection = '';

  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || COMMENT_PREFIXES.some((p) => trimmed.startsWith(p))) return;

    const sectionMatch = /^\[(.+?)]$/.exec(trimmed);
    if (sectionMatch && sectionMatch[1]) {
      currentSection = normalizeKey(sectionMatch[1]);
      sections[currentSection] ??= {};
      return;
    }

    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      warnings.push(`Line ${index + 1}: missing "=" — ignored ("${trimmed}")`);
      return;
    }

    const key = normalizeKey(trimmed.slice(0, eq));
    const value = trimmed.slice(eq + 1).trim();
    if (!key) {
      warnings.push(`Line ${index + 1}: empty key — ignored`);
      return;
    }

    const flatKey = currentSection ? `${currentSection}.${key}` : key;
    entries[flatKey] = value;
    keys.push(flatKey);
    (sections[currentSection] ??= {})[key] = value;
  });

  return { sections, entries, keys, warnings };
}

/** First section present among the given aliases. */
function pickSection(parsed: ParsedThemeIni, ...names: string[]): Record<string, string> {
  for (const name of names) {
    const section = parsed.sections[name];
    if (section) return section;
  }
  return {};
}

/* -------------------------------------------------------------------------- */
/* theme.ini -> semantic colour overrides                                     */
/* -------------------------------------------------------------------------- */

type ColorOverrides = DeepPartial<ThemeColors>;

/** Write a single normalized `colors.*` key into the override accumulator. */
function applyColorKey(overrides: ColorOverrides, key: string, hex: Hex): boolean {
  switch (key) {
    /* Brand */
    case 'brand_primary':
    case 'primary':
      overrides.brand = { ...overrides.brand, primary: hex };
      return true;
    case 'brand_primary_dark':
    case 'primary_dark':
      overrides.brand = { ...overrides.brand, primaryDark: hex };
      return true;
    case 'brand_primary_light':
    case 'primary_light':
      overrides.brand = { ...overrides.brand, primaryLight: hex };
      return true;
    case 'brand_on_primary':
    case 'on_primary':
      overrides.brand = { ...overrides.brand, onPrimary: hex };
      return true;
    case 'brand_ink':
    case 'ink':
      overrides.brand = { ...overrides.brand, ink: hex };
      return true;

    /* Chrome */
    case 'chrome_ink':
      overrides.chrome = { ...overrides.chrome, ink: hex };
      return true;
    case 'chrome_bg':
    case 'titlebar_bg':
      overrides.chrome = { ...overrides.chrome, bg: hex };
      return true;
    case 'chrome_bg_alt':
    case 'chrome_bg2':
      overrides.chrome = { ...overrides.chrome, bgAlt: hex };
      return true;
    case 'chrome_bevel_hi':
    case 'bevel_hi':
      overrides.chrome = { ...overrides.chrome, bevelHi: hex };
      return true;
    case 'chrome_bevel_lo':
    case 'bevel_lo':
      overrides.chrome = { ...overrides.chrome, bevelLo: hex };
      return true;
    case 'chrome_text':
      overrides.chrome = { ...overrides.chrome, text: hex };
      return true;

    /* Surface */
    case 'surface_base':
    case 'surface':
      overrides.surface = { ...overrides.surface, base: hex };
      return true;
    case 'surface_alt':
      overrides.surface = { ...overrides.surface, alt: hex };
      return true;
    case 'surface_raised':
      overrides.surface = { ...overrides.surface, raised: hex };
      return true;
    case 'surface_overlay':
      overrides.surface = { ...overrides.surface, overlay: hex };
      return true;
    case 'surface_pattern':
    case 'pattern':
      overrides.surface = { ...overrides.surface, pattern: hex };
      return true;

    /* Text */
    case 'text_primary':
      overrides.text = { ...overrides.text, primary: hex };
      return true;
    case 'text_secondary':
      overrides.text = { ...overrides.text, secondary: hex };
      return true;
    case 'text_disabled':
      overrides.text = { ...overrides.text, disabled: hex };
      return true;
    case 'text_inverse':
      overrides.text = { ...overrides.text, inverse: hex };
      return true;
    case 'text_link':
    case 'link':
      overrides.text = { ...overrides.text, link: hex };
      return true;
    case 'text_error':
      overrides.text = { ...overrides.text, error: hex };
      return true;
    case 'text_success':
      overrides.text = { ...overrides.text, success: hex };
      return true;
    case 'text_warning':
      overrides.text = { ...overrides.text, warning: hex };
      return true;
    case 'text_special':
      overrides.text = { ...overrides.text, special: hex };
      return true;
    case 'text_other_special':
      overrides.text = { ...overrides.text, otherSpecial: hex };
      return true;

    /* Borders / focus */
    case 'divider':
    case 'border_divider':
      overrides.border = { ...overrides.border, divider: hex };
      return true;
    case 'border_input':
      overrides.border = { ...overrides.border, input: hex };
      return true;
    case 'border_input_focus':
      overrides.border = { ...overrides.border, inputFocus: hex };
      return true;
    case 'focus':
      overrides.focus = hex;
      overrides.border = { ...overrides.border, focusRing: hex };
      return true;
    case 'border_focus_ring':
    case 'focus_ring':
      overrides.border = { ...overrides.border, focusRing: hex };
      return true;

    /* Presence */
    case 'presence_online':
    case 'online':
      overrides.presence = { ...overrides.presence, online: hex };
      return true;
    case 'presence_away':
    case 'away':
      overrides.presence = { ...overrides.presence, away: hex };
      return true;
    case 'presence_busy':
    case 'busy':
      overrides.presence = { ...overrides.presence, busy: hex };
      return true;
    case 'presence_invisible':
    case 'invisible':
      overrides.presence = { ...overrides.presence, invisible: hex };
      return true;
    case 'presence_offline':
    case 'offline':
      overrides.presence = { ...overrides.presence, offline: hex };
      return true;

    /* Delivery status */
    case 'status_pending':
      overrides.status = { ...overrides.status, pending: hex };
      return true;
    case 'status_sending':
      overrides.status = { ...overrides.status, sending: hex };
      return true;
    case 'status_sent':
    case 'sent':
      overrides.status = { ...overrides.status, sent: hex };
      return true;
    case 'status_delivered':
    case 'delivered':
      overrides.status = { ...overrides.status, delivered: hex };
      return true;
    case 'status_read':
    case 'read':
      overrides.status = { ...overrides.status, read: hex };
      return true;
    case 'status_failed':
    case 'failed':
      overrides.status = { ...overrides.status, failed: hex };
      return true;

    /* Semantic */
    case 'danger':
    case 'semantic_danger':
      overrides.semantic = { ...overrides.semantic, danger: hex };
      return true;
    case 'unread_badge':
    case 'unread':
    case 'semantic_unread_badge':
      overrides.semantic = { ...overrides.semantic, unreadBadge: hex };
      return true;
    case 'selected_bg':
      overrides.semantic = { ...overrides.semantic, selectedBg: hex };
      return true;
    case 'selected_text':
      overrides.semantic = { ...overrides.semantic, selectedText: hex };
      return true;
    case 'menubar_bg':
      overrides.semantic = { ...overrides.semantic, menuBarBg: hex };
      return true;
    case 'menubar_text':
      overrides.semantic = { ...overrides.semantic, menuBarText: hex };
      return true;
    case 'scrollbar_fill':
      overrides.semantic = { ...overrides.semantic, scrollbarFill: hex };
      return true;
    case 'scrollbar_track':
      overrides.semantic = { ...overrides.semantic, scrollbarTrack: hex };
      return true;
    case 'im_header':
      overrides.semantic = { ...overrides.semantic, imHeader: hex };
      return true;
    case 'im_recipients':
    case 'im_rcpts':
      overrides.semantic = { ...overrides.semantic, imRecipients: hex };
      return true;
    case 'bubble_in':
      overrides.semantic = { ...overrides.semantic, bubbleIn: hex };
      return true;
    case 'bubble_in_text':
      overrides.semantic = { ...overrides.semantic, bubbleInText: hex };
      return true;

    default:
      return false;
  }
}

/** Exact key -> semantic-token mapping for legacy Reptilian/Uzzap skin keys. */
const LEGACY_COLOR_MAP: Record<string, (o: ColorOverrides, hex: Hex) => void> = {
  kt_menu_selected_color: (o, hex) => {
    o.semantic = { ...o.semantic, selectedBg: hex, selectedText: hex };
  },
  kt_textview_font_color: (o, hex) => {
    o.text = { ...o.text, primary: hex };
  },
  kt_textview_special_color: (o, hex) => {
    o.text = { ...o.text, special: hex };
    o.semantic = { ...o.semantic, imHeader: hex };
  },
  kt_textview_other_special_color: (o, hex) => {
    o.text = { ...o.text, otherSpecial: hex };
    o.semantic = { ...o.semantic, imRecipients: hex };
  },
  kt_tabbedpanel_background_color: (o, hex) => {
    o.surface = { ...o.surface, base: hex };
  },
  kt_popup_background_color: (o, hex) => {
    o.surface = { ...o.surface, raised: hex };
  },
  kalypte_messenger_im_header_color: (o, hex) => {
    o.semantic = { ...o.semantic, imHeader: hex };
  },
  kalypte_messenger_im_rcpts_color: (o, hex) => {
    o.semantic = { ...o.semantic, imRecipients: hex };
  },
  kalypte_mainmenu_textbar_color: (o, hex) => {
    o.semantic = { ...o.semantic, menuBarBg: hex };
  },
  kalypte_mainmenu_textbar_font_color: (o, hex) => {
    o.semantic = { ...o.semantic, menuBarText: hex };
  },
  kt_titlebar_font_color: (o, hex) => {
    o.chrome = { ...o.chrome, text: hex };
  },
  kt_functionbar_font_color: (o, hex) => {
    o.chrome = { ...o.chrome, text: hex };
  },
  kt_optionsmenu_editor_special_color: (o, hex) => {
    o.text = { ...o.text, special: hex };
  },
  kt_optionsmenu_editor_other_special_color: (o, hex) => {
    o.text = { ...o.text, otherSpecial: hex };
  },
  kt_menuentries_font_color: (o, hex) => {
    o.semantic = { ...o.semantic, menuBarText: hex };
  },
  kt_scrollbar_color_fill: (o, hex) => {
    o.semantic = { ...o.semantic, scrollbarFill: hex };
  },
  kt_scrollbar_color_bg: (o, hex) => {
    o.semantic = { ...o.semantic, scrollbarTrack: hex };
  },
  kalypte_statusdisplay_font_color: (o, hex) => {
    o.text = { ...o.text, secondary: hex };
  },
};

/** Convert parsed `[colors]` + legacy keys into partial semantic overrides. */
export function themeIniToColorOverrides(parsed: ParsedThemeIni): ColorOverrides {
  const overrides: ColorOverrides = {};
  const colorSection = pickSection(parsed, 'colors', 'color', 'colour');

  Object.entries(colorSection).forEach(([rawKey, value]) => {
    const hex = normalizeHex(value);
    if (!hex) {
      parsed.warnings.push(`Unparseable colour for "${rawKey}": "${value}"`);
      return;
    }
    if (!applyColorKey(overrides, rawKey, hex)) {
      parsed.warnings.push(`Unknown colour key "${rawKey}" — ignored`);
    }
  });

  // Legacy flat keys (normalised to `_`). Scan every section so keys still
  // resolve if they were written under a section header.
  const legacyKeys = new Set<string>();
  Object.values(parsed.sections).forEach((section) => {
    Object.entries(section).forEach(([flatKey, value]) => {
      const setter = LEGACY_COLOR_MAP[flatKey];
      if (!setter || legacyKeys.has(flatKey)) return;
      legacyKeys.add(flatKey);
      const hex = normalizeHex(value);
      if (hex) setter(overrides, hex);
      else parsed.warnings.push(`Unparseable legacy colour for "${flatKey}": "${value}"`);
    });
  });

  return overrides;
}

/* -------------------------------------------------------------------------- */
/* theme.ini -> layout / font overrides                                       */
/* -------------------------------------------------------------------------- */

type LayoutKey = keyof LayoutTokens;
type FontSizeKey = keyof TypeScale;

const METRIC_MAP: Record<string, LayoutKey> = {
  titlebar_height: 'titleBarHeight',
  title_bar_height: 'titleBarHeight',
  functionbar_height: 'functionBarHeight',
  function_bar_height: 'functionBarHeight',
  menu_bottombar_height: 'menuBottomBarHeight',
  menu_bottom_bar_height: 'menuBottomBarHeight',
  presence_strip_height: 'presenceStripHeight',
  section_header_height: 'sectionHeaderHeight',
  search_bar_height: 'searchBarHeight',
  buddy_row_height: 'buddyRowHeight',
  settings_row_height: 'settingsRowHeight',
  input_height: 'inputHeight',
  avatar_sm: 'avatarSm',
  avatar_md: 'avatarMd',
  avatar_lg: 'avatarLg',
  fab_size: 'fabSize',
  gutter_screen: 'gutterScreen',
  content_inset: 'contentInset',
  list_row_padding_h: 'listRowPaddingH',
  list_row_padding_v: 'listRowPaddingV',
  card_padding: 'cardPadding',
  sheet_padding: 'sheetPadding',
  min_touch_target: 'minTouchTarget',
};

const FONT_MAP: Record<string, FontSizeKey> = {
  xxs: 'xxs',
  xs: 'xs',
  sm: 'sm',
  body_sm: 'bodySm',
  body: 'body',
  md: 'md',
  body_lg: 'bodyLg',
  lg: 'lg',
  xl: 'xl',
  xxl: 'xxl',
  wordmark: 'wordmark',
  emoticon_large: 'emoticonLarge',
  font_xxs: 'xxs',
  font_xs: 'xs',
  font_sm: 'sm',
  font_body: 'body',
  font_md: 'md',
  font_lg: 'lg',
  font_xl: 'xl',
};

function parseMetric(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Convert `[metrics]` into partial layout overrides. */
export function themeIniToLayoutOverrides(parsed: ParsedThemeIni): Partial<LayoutTokens> {
  const out: Partial<Record<LayoutKey, number>> = {};
  const metrics = pickSection(parsed, 'metrics', 'metric', 'layout', 'sizes');

  Object.entries(metrics).forEach(([key, value]) => {
    const target = METRIC_MAP[key];
    if (!target) {
      parsed.warnings.push(`Unknown metric key "${key}" — ignored`);
      return;
    }
    const num = parseMetric(value);
    if (num === null) {
      parsed.warnings.push(`Unparseable metric for "${key}": "${value}"`);
      return;
    }
    out[target] = num;
  });

  return out;
}

/** Convert `[fonts]` into partial font-size overrides. */
export function themeIniToFontOverrides(parsed: ParsedThemeIni): Partial<TypeScale> {
  const out: Partial<Record<FontSizeKey, number>> = {};
  const fonts = pickSection(parsed, 'fonts', 'font', 'typography');

  Object.entries(fonts).forEach(([key, value]) => {
    const target = FONT_MAP[key];
    if (!target) return;
    const num = parseMetric(value);
    if (num === null) {
      parsed.warnings.push(`Unparseable font size for "${key}": "${value}"`);
      return;
    }
    out[target] = num;
  });

  return out;
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the effective theme for a parsed theme.ini on top of a compiled base
 * theme. Resolution order: compiled base → theme.ini runtime overrides.
 */
export function applyThemeIni(base: ThemeTokens, rawText: string): ThemeTokens {
  const parsed = parseThemeIni(rawText);
  const colors = themeIniToColorOverrides(parsed);
  const layoutOverrides = themeIniToLayoutOverrides(parsed);
  const fontOverrides = themeIniToFontOverrides(parsed);

  return mergeTheme(base, {
    colors,
    layout: layoutOverrides,
    fontSize: fontOverrides,
    rawThemeIni: parsed.entries,
  });
}

/** Load the bundled Uzzap theme.ini and apply it onto a base theme. */
export function applyBundledUzzapThemeIni(base: ThemeTokens): ThemeTokens {
  return applyThemeIni(base, uzzapThemeIni());
}
