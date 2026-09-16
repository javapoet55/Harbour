import { Pressable, StyleSheet, View } from 'react-native';

import type { ScheduleAttentionItem } from '../api/types';
import { useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * Port of `attentionCard(_:opensTasks:)` (ios/App/RootView.swift:1261-1279), a private func on
 * `TodayView` used by the dashboard's attention list, by `attentionDetails` and by the schedule check.
 */
export function AttentionCard({
  item,
  opensTasks,
  onPress,
  testID,
}: {
  item: ScheduleAttentionItem;
  /** Draws the chevron. Swift passes false inside a List, which supplies its own. */
  opensTasks: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();

  const body = (
    <>
      <Text style={[styles.label, { color: theme.colors.danger }]}>{item.label.toUpperCase()}</Text>
      <View style={styles.titleRow}>
        <Text style={[styles.title, styles.grow, { color: theme.colors.ink }]}>{item.title}</Text>
        {opensTasks ? <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} /> : null}
      </View>
      <Text style={[styles.explanation, { color: theme.colors.secondary }]}>{item.explanation}</Text>
    </>
  );

  const style = [styles.card, { backgroundColor: theme.colors.surface }];

  return onPress ? (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${item.label}. ${item.title}. ${item.explanation}`}
      onPress={onPress}
      testID={testID}
      style={style}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={`${item.label}. ${item.title}. ${item.explanation}`} style={style} testID={testID}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.padding(16)`, corner radius 16, secondarySystemGroupedBackground.
  card: { gap: 6, padding: 16, borderRadius: 16 },
  // `.font(.caption2.bold())`
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  explanation: { fontSize: 15, lineHeight: 20 },
  grow: { flex: 1 },
});
