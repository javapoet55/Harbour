import { useColorScheme } from 'react-native';

import { palettes, type ColorScheme, type Palette } from './colors';
import { radii } from './radii';
import { spacing } from './spacing';
import { textStyles, typography } from './typography';

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  textStyles: typeof textStyles;
};

/**
 * Follows the system appearance. A manual override is Phase 7.
 *
 * Pass `{ elevated: true }` from a screen presented as a sheet: iOS resolves the system background
 * colours one level up inside a sheet, so a dark sheet is #1C1C1E where the root screen is black.
 */
export function useTheme(options?: { elevated?: boolean }): Theme {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = palettes[scheme];
  const colors: Palette = options?.elevated
    ? {
        ...palette,
        background: palette.backgroundElevated,
        groupedBackground: palette.groupedBackgroundElevated,
        surface: palette.surfaceElevated,
      }
    : palette;
  return { scheme, colors, spacing, radii, typography, textStyles };
}
