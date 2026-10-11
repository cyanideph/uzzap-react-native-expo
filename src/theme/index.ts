/**
 * Uzzap theme system — public barrel.
 *
 * ```ts
 * import { ThemeProvider, useTheme, uzzapTheme, defaultTheme } from '@theme';
 * ```
 */

export * from './tokens';
export * from './createTheme';
export * from './deriveDark';
export * from './parseThemeIni';
export * from './registry';
export * from './ThemeProvider';
export * from './uzzap';
export * from './default';
export { uzzapThemeIni, EMBEDDED_UZZAP_THEME_INI } from './sources';
