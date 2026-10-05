import { Platform, StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type Palette, type TextVariant } from '../theme';

export type TextTone = keyof Pick<Palette, 'ink' | 'secondary' | 'tint' | 'link' | 'onTint' | 'danger' | 'scheduleBlue'>;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
};

/**
 * One device pixel of slack on each side, cancelled by an equal negative margin, so the text *box*
 * is wider than the glyph run while the layout is unchanged.
 *
 * Android measures a `Text` and then draws it in two separate passes, and Yoga rounds the measured
 * width onto the device's pixel grid in between. At this phone's density of 1.875 that rounding can
 * land a fraction of a pixel short, and the draw pass then decides the string no longer fits on one
 * line and breaks it at the last space — but the view was sized for one line, so the second line is
 * clipped away and never appears. "Add task" rendered as "Add"; "This Week" rendered as "This".
 *
 * There is no ellipsis and no warning, and `uiautomator dump` still reports the full string, so it
 * reads as a copy bug rather than a layout one. See docs/swift-to-rn-style-map.md §4.
 *
 * iOS measures and draws from the same layout and does not need this.
 */
const slack = StyleSheet.create({
  android: { paddingHorizontal: 1, marginHorizontal: -1 },
});

type Flat = Record<string, unknown>;
const side = (flat: Flat, keys: string[]): number | null => {
  for (const key of keys) {
    const value = flat[key];
    if (value === undefined) continue;
    return typeof value === 'number' ? value : null;
  }
  return 0;
};

/**
 * The slack ADDED to the horizontal padding and margin the caller set, on each side. React Native's
 * `paddingHorizontal` / `marginHorizontal` beat the `padding` / `margin` shorthand whatever the order, so
 * the plain slack silently wiped a caller's `padding: 16` down to 1 (the Add Food note sat on the card's
 * edge). A side set in percent or `auto` keeps the caller's value and gets no slack.
 */
function slackFor(style: TextProps['style']) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Flat;
  const has = ['padding', 'paddingHorizontal', 'paddingLeft', 'paddingRight', 'paddingStart', 'paddingEnd', 'margin', 'marginHorizontal', 'marginLeft', 'marginRight', 'marginStart', 'marginEnd'].some(
    (key) => flat[key] !== undefined,
  );
  if (!has) return slack.android;
  const padLeft = side(flat, ['paddingStart', 'paddingLeft', 'paddingHorizontal', 'padding']);
  const padRight = side(flat, ['paddingEnd', 'paddingRight', 'paddingHorizontal', 'padding']);
  const marLeft = side(flat, ['marginStart', 'marginLeft', 'marginHorizontal', 'margin']);
  const marRight = side(flat, ['marginEnd', 'marginRight', 'marginHorizontal', 'margin']);
  if (padLeft === null || padRight === null || marLeft === null || marRight === null) return null;
  return { paddingStart: padLeft + 1, paddingEnd: padRight + 1, marginStart: marLeft - 1, marginEnd: marRight - 1 };
}

export function Text({ variant = 'body', tone = 'ink', style, ...rest }: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      style={[theme.typography[variant], { color: theme.colors[tone] }, style, Platform.OS === 'android' && slackFor(style)]}
      {...rest}
    />
  );
}
