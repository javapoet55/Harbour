import { useColorScheme } from 'react-native';

import { useAppearance } from '../store/appearance';
import { useElevated } from './elevation';
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
 * Honours the account holder's Appearance choice, falling back to the system one.
 *
 * `NexdoApp` applies it once at the root — `RootView().preferredColorScheme(appearance.colorScheme)`
 * (ios/App/NexdoApp.swift:8) — where `AppAppearance.colorScheme` is `nil` for System, `.light` for
 * Day and `.dark` for Night (AppAppearance.swift:30-36). React Native has no equivalent root
 * override, so the resolution happens here, in the one hook every screen already calls.
 *
 * Pass `{ elevated: true }` from a screen presented as a sheet: iOS resolves the system background
 * colours one level up inside a sheet, so a dark sheet is #1C1C1E where the root screen is black.
 * Better still, wrap the screen in `<ElevatedSurface>`, which does the same for every descendant —
 * a shared component cannot know it is inside a sheet, and several were resolving the base palette
 * while the screen around them used the elevated one.
 */
export function useTheme(options?: { elevated?: boolean }): Theme {
  const appearance = useAppearance((state) => state.appearance);
  const system: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme: ColorScheme = appearance === 'day' ? 'light' : appearance === 'night' ? 'dark' : system;
  const palette = palettes[scheme];
  const inherited = useElevated();
  const colors: Palette = (options?.elevated ?? inherited)
    ? {
        ...palette,
        background: palette.backgroundElevated,
        groupedBackground: palette.groupedBackgroundElevated,
        surface: palette.surfaceElevated,
        fieldSurface: palette.fieldSurfaceElevated,
        fieldOnGroup: palette.fieldOnGroupElevated,
      }
    : palette;
  return { scheme, colors, spacing, radii, typography, textStyles };
}
