import { useColorScheme } from 'react-native';

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

/** Follows the system appearance. A manual override is Phase 7. */
export function useTheme(): Theme {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: palettes[scheme], spacing, radii, typography };
}
