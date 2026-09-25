import { createContext } from 'react';
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
 * - `inGroup`: the field sits inside an `androidGroup` card, which is already on `fieldSurface`, so
 *   it takes `fieldOnGroup` (white in light, one step lighter in dark).
 * - `padded: false`: a choice button, value capsule or control group that keeps its own padding
 *   and takes only the surface, hairline and radius.
 */
export function androidField(
  theme: Theme,
  focused = false,
  { raised = false, inGroup = false, padded = true }: { raised?: boolean; inGroup?: boolean; padded?: boolean } = {},
): ViewStyle | null {
  if (!isAndroid()) return null;
  return {
    backgroundColor: inGroup ? theme.colors.fieldOnGroup : raised ? theme.colors.fieldSurfaceElevated : theme.colors.fieldSurface,
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

/**
 * THE Android field label (docs/android-polish.md §4) — every form's caption above a field or group:
 * Task Details' TASK/PRIORITY…, New Task's and New Event's icon labels, Moments/Shopping/Reset
 * password/project editor section headers. 12pt semibold, tracked 0.6, uppercase, in `fieldLabel`.
 * `textTransform` changes only how the text draws; the string (and what a screen reader says) is
 * the one the screen passes.
 */
export function androidLabel(theme: Theme): TextStyle | null {
  if (!isAndroid()) return null;
  return {
    color: theme.colors.fieldLabel,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  };
}

/** The label's glyph, when it has one: 14pt, in `fieldLabel`, 6 from the text (`androidLabelRow`). */
export const ANDROID_LABEL_ICON = 14;
/** The row holding a label's glyph and text. */
export const androidLabelRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 6 };
/** Label → its field. */
export const ANDROID_LABEL_GAP = 8;
/** The space above a label: the previous field, or the section divider, to the label. */
export const ANDROID_SECTION_GAP = 20;

/**
 * A horizontal chip row (the Tasks date filters, New Task's DATE and TIME ESTIMATE, New Event's
 * weekdays): a `ScrollView` with no indicator that cancels its container's `inset` so it scrolls
 * edge to edge, 16 of content padding so the last chip is never cut, 8 between chips.
 */
export function androidChipScroll(inset: number): { style: ViewStyle; contentContainerStyle: ViewStyle } {
  return { style: { marginHorizontal: -inset, flexGrow: 0 }, contentContainerStyle: { gap: 8, paddingHorizontal: 16 } };
}
/** One chip in a chip row: 36 tall, 12 inside, as wide as its label. */
export const androidChip: ViewStyle = { height: 36, minHeight: 36, paddingHorizontal: 12 };

/**
 * What a Moments `MenuPicker` or `DateField` sits on, so its value pill can take the field chrome in
 * a form and stay as it was anywhere else (the Moments filter menu, say):
 * - `'group'`: an `androidGroup` card (a Moments/Shopping `FormSection`, a `grouped` `MomentCard`);
 * - `'card'`: a plain card that is not a group (New List's glass card);
 * - `null`: not a form.
 */
export type FieldPlacement = 'group' | 'card' | null;
export const FieldGroupContext = createContext<FieldPlacement>(null);

/** A value pill (date, time, menu choice) in a form: the field surface for where it sits, no padding. */
export function androidPill(theme: Theme, placement: FieldPlacement): ViewStyle | null {
  if (placement === null) return null;
  return androidField(theme, false, { inGroup: placement === 'group', raised: placement === 'card', padded: false });
}

/** A pinned bottom bar: a top hairline over a raised surface. */
export function androidBar(theme: Theme): ViewStyle | null {
  if (!isAndroid()) return null;
  return { backgroundColor: theme.colors.barSurface, borderTopWidth: 1, borderTopColor: theme.colors.fieldBorder };
}
