import {
  breakpoint,
  duration,
  easing,
  fontFamily,
  fontSize,
  fontWeight,
  iconSize,
  layout,
  lineHeight,
  radius,
  shadows,
  space,
  stroke,
  zIndex,
  type ThemeColors,
  type ThemeId,
  type ThemeTokens,
} from './tokens';

/**
 * Assemble a full `ThemeTokens` from a semantic colour map plus the shared,
 * non-colour token scales. Every theme goes through here, guaranteeing that
 * spacing, radii, typography and motion stay identical across themes.
 */
export function createTheme(input: {
  id: ThemeId;
  name: string;
  dark: boolean;
  colors: ThemeColors;
  rawThemeIni?: Record<string, string>;
}): ThemeTokens {
  return {
    id: input.id,
    name: input.name,
    dark: input.dark,
    colors: input.colors,
    typography: {
      family: fontFamily,
      size: fontSize,
      weight: fontWeight,
      lineHeight,
    },
    space,
    radius,
    stroke,
    iconSize,
    duration,
    easing,
    zIndex,
    layout,
    breakpoint,
    shadows,
    rawThemeIni: input.rawThemeIni ?? {},
  };
}
