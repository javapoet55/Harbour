import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from './Text';

export type SymbolLabelProps = {
  /** The Ionicons glyph standing in for the SF Symbol. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  children: string;
  color: string;
  /** The label's text style. */
  textStyle: StyleProp<TextStyle>;
  /** Point size for the icon, matching the SF Symbol's optical size. */
  iconSize: number;
  /**
   * Gap between icon and title. Set this so `iconSize + spacing` equals the SF Symbol's advance plus
   * SwiftUI's Label spacing, measured off the Swift app — it decides where the title wraps.
   */
  spacing?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A port of SwiftUI's `Label(_:systemImage:)`: an icon and a wrapping title on one line.
 *
 * **Known difference.** SwiftUI sizes a wrapped `Text` to its longest rendered line, so a centred
 * `Label` is a tight block in the middle of its parent. Flexbox has no "shrink to longest line":
 * a shrinking child is measured at its max-content width and then clamped to what is available, so
 * the row always ends up full width and the block reads as left-aligned. Measuring with
 * `onTextLayout` does not help — React Native reports the line's layout width, which is the
 * container width, not the ink width, so feeding it back only widens the row and changes the wrap.
 *
 * The result is a block that starts at the parent's leading padding instead of being centred: on
 * sign-in that is a 14pt horizontal shift on a two-line footnote. Everything else — wrap point,
 * line height, colour, spacing — matches.
 */
export function SymbolLabel({ icon, children, color, textStyle, iconSize, spacing = 8, style }: SymbolLabelProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.row, { gap: spacing }]}>
        <Ionicons name={icon} size={iconSize} color={color} style={styles.icon} />
        <Text style={[textStyle, styles.text, { color }]}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row' },
  icon: { marginTop: 2 },
  text: { flexShrink: 1, textAlign: 'left' },
});
