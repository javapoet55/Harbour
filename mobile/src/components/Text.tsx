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

export function Text({ variant = 'body', tone = 'ink', style, ...rest }: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      style={[theme.typography[variant], { color: theme.colors[tone] }, Platform.OS === 'android' && slack.android, style]}
      {...rest}
    />
  );
}
