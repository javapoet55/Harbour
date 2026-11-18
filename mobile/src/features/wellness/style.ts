import { brand, palettes } from '../../theme';
import { systemColors } from '../moments/components';

/**
 * The Wellness screens' light colours. Swift draws the module guides in FIXED light colours, so they
 * stay light in dark mode here too (android-polish.md, Phase 12 Run C). The chooser uses these in light
 * mode only; it has its own dark mode since 4185501 (§33). Pomodoro and the Calorie Tracker follow the
 * theme since ce6d20a (§60).
 */

/** SwiftUI's system colours, light values. */
export const swiftColors = {
  ...systemColors,
  indigo: '#5856D6',
  mint: '#00C7BE',
  white: '#FFFFFF',
} as const;

/** `Color.nexdoSecondary` in light (RootView.swift:886). */
export const nexdoSecondary = palettes.light.secondary;

/** iOS `.secondary` (`.secondaryLabel`) in light. */
export const secondaryLabel = palettes.light.secondaryLabel;

/**
 * `Color.nexdoIndigo` as the FIXED-LIGHT guide and the light chooser use it: the Pomodoro module colour.
 * It never meets a dark background there, so the dark-mode `link` rule does not apply (android-polish.md
 * §21); every other screen keeps using `theme.colors.link`.
 */
export const fixedLightIndigo = brand.nexdoIndigo;
