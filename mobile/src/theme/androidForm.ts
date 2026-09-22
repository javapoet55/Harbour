import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import type { Theme } from './useTheme';

/**
 * Android form chrome (docs/android-polish.md §2): the one place fields, cards, outlined buttons,
 * section labels and bottom bars get their Android look, so every screen built from the shared
 * pieces picks it up together. Each helper returns `null` on iOS, which keeps the Swift look there.
 *
 * Read at render time, not at module load, so a test can switch `Platform.OS`.
 */
export const isAndroid = () => Platform.OS === 'android';

/**
 * An input or dropdown field: hairline, one step above the page, 12 radius, 14/16 padding.
 *
 * - `raised`: the field sits on a card (New Task, New Event) rather than on the page, so it takes
 *   the step above the card's `surface` (`fieldSurfaceElevated`) and stays distinct from it.
 * - `padded: false`: a choice button, value capsule or control group that keeps its own padding
 *   and takes only the surface, hairline and radius.
 */
export function androidField(
  theme: Theme,
  focused = false,
  { raised = false, padded = true }: { raised?: boolean; padded?: boolean } = {},
): ViewStyle | null {
  if (!isAndroid()) return null;
  return {
    backgroundColor: raised ? theme.colors.fieldSurfaceElevated : theme.colors.fieldSurface,
    borderWidth: 1,
    borderColor: focused ? theme.colors.accent : theme.colors.fieldBorder,
    borderRadius: 12,
    ...(padded ? { paddingVertical: 14, paddingHorizontal: 16 } : null),
  };
}

/**
 * A grouped card of form rows (Moments and Shopping `Form` sections, Manage Moment's form cards):
 * the field surface and hairline round the whole group, with `androidSeparator` between rows.
 * The rows themselves carry no border — a bordered field inside a bordered card doubles the line.
 */
export function androidGroup(theme: Theme): ViewStyle | null {
  if (!isAndroid()) return null;
  return { backgroundColor: theme.colors.fieldSurface, borderWidth: 1, borderColor: theme.colors.fieldBorder };
}

/** The 1px line between two rows of an `androidGroup`. */
export function androidSeparator(theme: Theme): ViewStyle | null {
  if (!isAndroid()) return null;
  return { height: 1, backgroundColor: theme.colors.fieldBorder };
}

/** A card: the same hairline and surface as a field, 16 padding. */
export function androidCard(theme: Theme): ViewStyle | null {
  if (!isAndroid()) return null;
  return {
    backgroundColor: theme.colors.fieldSurface,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    padding: 16,
  };
}

/** An outlined secondary button: accent hairline over a 10% accent tint, 48 tall. */
export function androidSecondaryButton(theme: Theme): ViewStyle | null {
  if (!isAndroid()) return null;
  return {
    backgroundColor: theme.colors.accentTint,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    borderRadius: 12,
    minHeight: 48,
  };
}

/** The label on `androidSecondaryButton`. */
export function androidSecondaryLabel(theme: Theme): TextStyle | null {
  return isAndroid() ? { color: theme.colors.accent } : null;
}

/** A section label (TASK, PRIORITY…): secondary, 12, tracked 0.6. */
export function androidSectionLabel(theme: Theme): TextStyle | null {
  if (!isAndroid()) return null;
  return { color: theme.colors.secondary, fontSize: 12, letterSpacing: 0.6 };
}

/** A pinned bottom bar: a top hairline over a raised surface. */
export function androidBar(theme: Theme): ViewStyle | null {
  if (!isAndroid()) return null;
  return { backgroundColor: theme.colors.barSurface, borderTopWidth: 1, borderTopColor: theme.colors.fieldBorder };
}
