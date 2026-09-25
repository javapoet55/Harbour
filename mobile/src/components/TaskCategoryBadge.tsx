import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CATEGORY_COLORS, type TaskCategoryAppearance } from '../lib/taskCategory';
import { Text } from './Text';

export type TaskCategoryBadgeProps = {
  appearance: TaskCategoryAppearance;
  style?: StyleProp<ViewStyle>;
};

/**
 * Port of `TaskCategoryBadge` (ios/App/TaskCategoryBadge.swift).
 *
 * VISUAL GAP — the largest in this phase. The Swift badge draws bespoke vector ARTWORK for each of the
 * twelve kinds: a `ToothShape` for dental, a `Canvas` stick-figure-with-barbell for fitness, and so on
 * (TaskCategoryBadge.swift:33+). None of that is reproduced. This renders the capsule, the two-colour
 * gradient fill and the label faithfully, with a single coloured dot where the artwork goes.
 *
 * TODO(phase3-decision): reproducing the artwork needs `react-native-svg` (native code, so a new
 * development build) and twelve hand-ported drawings. Left for the `rn-ui-parity` pass to decide,
 * because it is a large amount of work for a 23pt glyph and it blocks nothing else.
 */
export function TaskCategoryBadge({ appearance, style }: TaskCategoryBadgeProps) {
  const colors = CATEGORY_COLORS[appearance.kind];

  return (
    <LinearGradient
      // `colors.map { $0.opacity(0.11) }`, topLeading to bottomTrailing.
      colors={[withAlpha(colors[0], 0.11), withAlpha(colors[1], 0.11)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.capsule, style]}
      accessibilityLabel={`Category: ${appearance.label}`}
      accessible
    >
      <View style={[styles.mark, { backgroundColor: colors[0] }]} />
      <Text numberOfLines={1} style={[styles.label, { color: colors[0] }]}>
        {appearance.label}
      </Text>
    </LinearGradient>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  // `.padding(.horizontal, 10).padding(.vertical, 8)`, capsule.
  capsule: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  // Stands in for the 23pt bespoke artwork.
  mark: { width: 10, height: 10, borderRadius: 5 },
  // `.font(.caption.weight(.medium))`
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500', flexShrink: 1 },
});
