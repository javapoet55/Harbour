import { brand, palettes } from '../../theme';
import { systemColors } from '../moments/components';

/**
 * The Wellness screens' colours. Swift draws the chooser, the guides and Pomodoro in FIXED light colours
 * — white cards, gradients from `.white`, an explicit ink, and `.preferredColorScheme(.light)` on the
 * Pomodoro dashboard — so they stay light in dark mode here too (android-polish.md, Phase 12 Run C).
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
 * `Color.nexdoIndigo` as these FIXED-LIGHT screens use it: the Pomodoro module colour and the Pomodoro
 * tint. It never meets a dark background here, so the dark-mode `link` rule does not apply
 * (android-polish.md §21); every other screen keeps using `theme.colors.link`.
 */
export const fixedLightIndigo = brand.nexdoIndigo;
