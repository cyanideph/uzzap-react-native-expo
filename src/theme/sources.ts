/**
 * Bundled theme.ini sources.
 *
 * The real `themes/uzzap/theme.ini` from the decompiled J2ME client is copied
 * into `assets/themes/uzzap/theme.ini` and inlined at build time by
 * `babel-plugin-inline-import` (see babel.config.js). If a future build strips
 * the asset, the embedded fallback below keeps the exact same values available.
 */

// eslint-disable-next-line import/no-unresolved
import uzzapThemeIniRaw from '../../assets/themes/uzzap/theme.ini';

/** Exact copy of the extracted `themes/uzzap/theme.ini` (Reptilian skin). */
export const EMBEDDED_UZZAP_THEME_INI = `kt.skin.name=Reptilian
#
# colors
#

kt.menu.selected.color=c0fd85
kt.textview.font.color=000000
kt.textview.special.color=af0c0d
kt.textview.other.special.color=0d0caf
kt.tabbedpanel.background.color=f9f9f9
kt.popup.background.color=f9f9f9
kalypte.messenger.im.header.color=af0c0d
kalypte.messenger.im.rcpts.color=0d0caf
kalypte.mainmenu.textbar.color=8eef04
kalypte.mainmenu.textbar.font.color=000000
kt.titlebar.font.color=000000
kt.functionbar.font.color=000000
kt.optionsmenu.editor.special.color=af0c0d
kt.optionsmenu.editor.other.special.color=0d0caf
kt.menuentries.font.color=000000
kt.scrollbar.color.fill=8eef04
kt.scrollbar.color.bg=05741d
kalypte.statusdisplay.font.color=000000

#
# fonts
#

kalypte.calldisplay.font=20
kalypte.statusdisplay.font=20
kalypte.statusdisplay.errtxt.font=14
kt.functionbar.font=14
kt.bitmaplabel.font=14
kt.fancymenubar.font=14
kt.textlabel.font=14
kt.textview.font=14
kt.menu.font=14
kt.titlebar.font=14
kalypte.titlebar.font=14
kt.default.font=14
kalypte.contactupload.font=14
`;

/** Raw text of the bundled uzzap theme.ini, with embedded fallback. */
export function uzzapThemeIni(): string {
  return typeof uzzapThemeIniRaw === 'string' && uzzapThemeIniRaw.trim().length > 0
    ? uzzapThemeIniRaw
    : EMBEDDED_UZZAP_THEME_INI;
}
