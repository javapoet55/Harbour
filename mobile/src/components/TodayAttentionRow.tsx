import { Pressable, StyleSheet, View } from 'react-native';

import { attentionRowSubtitle } from '../lib/todayQuickAccess';
import { brand, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The Today attention row (ios/App/RootView.swift:1146-1166, commit 63d9542). Reference pattern 12.
 *
 * It replaced the inline "Needs your attention" list. The caller decides whether it shows
 * (`overdueCount + otherCount > 0`); tapping it presents the Needs attention sheet.
 */
export function TodayAttentionRow({ overdue, other, onPress }: { overdue: number; other: number; onPress: () => void }) {
  const theme = useTheme();
  const subtitle = attentionRowSubtitle(overdue, other);
  // `.orange` and `.brown` are the system colours.
  const orange = theme.scheme === 'dark' ? '#FF9F0A' : '#FF9500';
  const brown = theme.scheme === 'dark' ? '#AC8E68' : '#A2845E';
  return (
    <Pressable
      accessibilityLabel={`Needs attention, ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      // `.background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))`
      // with an indigo 12% stroke.
      style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}
      testID="today-attention-summary"
    >
      {/* `.font(.title2)`: 22pt. */}
      <TaskSymbol color={orange} name="exclamationmark.triangle.fill" size={22} />
      <View style={styles.labels}>
        <Text style={[styles.headline, { color: theme.colors.ink }]}>Needs attention</Text>
        <Text style={[styles.subheadline, { color: theme.colors.secondary }]} testID="today-attention-subtitle">
          {subtitle}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: withAlpha(orange, 0.18) }]}>
        <Text style={[styles.badgeText, { color: brown }]} testID="today-attention-count">
          {String(overdue + other)}
        </Text>
      </View>
      <TaskSymbol color={theme.colors.secondary} name="chevron.right" size={17} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  // `Spacer(minLength: 4)` — the labels take the free width.
  labels: { flex: 1, gap: 3, marginRight: 4 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
