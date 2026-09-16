import { useColorScheme } from 'react-native';

import { useAppearance } from '../store/appearance';
import { palettes, type ColorScheme, type Palette } from './colors';
import { radii } from './radii';
import { spacing } from './spacing';
import { typography } from './typography';

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
};

/**
 * Honours the account holder's Appearance choice, falling back to the system one.
 *
 * `NexdoApp` applies it once at the root — `RootView().preferredColorScheme(appearance.colorScheme)`
 * (ios/App/NexdoApp.swift:8) — where `AppAppearance.colorScheme` is `nil` for System, `.light` for
 * Day and `.dark` for Night (AppAppearance.swift:30-36). React Native has no equivalent root
 * override, so the resolution happens here, in the one hook every screen already calls.
 */
export function useTheme(): Theme {
  const appearance = useAppearance((state) => state.appearance);
  const system: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme: ColorScheme = appearance === 'day' ? 'light' : appearance === 'night' ? 'dark' : system;
  return { scheme, colors: palettes[scheme], spacing, radii, typography };
}
