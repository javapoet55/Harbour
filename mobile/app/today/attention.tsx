import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { TaskSymbol, Text } from '../../src/components';
import { AttentionCard } from '../../src/components/AttentionCard';
import { useScheduleIntelligence } from '../../src/query/useToday';
import { useTasks } from '../../src/query/useTasks';
import { useTheme } from '../../src/theme';

/**
 * Port of `attentionDetails` (ios/App/RootView.swift:1202-1231), a private `@ViewBuilder` var on
 * `TodayView`. Child view followed: `attentionCard(_:opensTasks:)` (`RootView.swift:1261`), ported as
 * `src/components/AttentionCard.tsx`.
 *
 * Swift falls through to `OverdueTasksView` when the range is not Today or intelligence is missing
 * (`:1203-1204`). Here the screen is only reachable from the Today range, so the fallback is the
 * missing-intelligence case: it redirects to the overdue list.
 *
 * The list is sorted with the "overdue" item first (`:1210`), and only an item WITH task ids is
 * tappable through to the schedule check.
 */
export default function Attention() {
  const theme = useTheme();
  const intelligence = useScheduleIntelligence();
  const tasks = useTasks();

  const items = [...(intelligence.data?.today.attention ?? [])].sort((left, right) => {
    if (left.id === right.id) return 0;
    if (left.id === 'overdue') return -1;
    if (right.id === 'overdue') return 1;
    return 0;
  });

  const refresh = () => {
    void tasks.refetch();
    void intelligence.refetch();
  };

  // `if range != .today || model.scheduleIntelligence == nil { OverdueTasksView() }`
  if (!intelligence.isLoading && !intelligence.data) {
    return (
      <View style={[styles.fill, styles.centre, { backgroundColor: theme.colors.groupedBackground }]} testID="attention-fallback">
        <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondary }]}>
          Schedule intelligence is unavailable. Showing your unfinished deadlines instead.
        </Text>
        <Text
          accessibilityRole="button"
          accessibilityLabel="Open unfinished deadlines"
          onPress={() => router.replace('/today/overdue')}
          style={[theme.typography.body, { color: theme.colors.tint }]}
        >
          Open unfinished deadlines
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.groupedBackground }}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={intelligence.isRefetching} onRefresh={refresh} />}
    >
      {items.length === 0 ? (
        <View accessible style={styles.centre} testID="attention-empty">
          <TaskSymbol name="checkmark.circle" size={38} color={theme.colors.secondary} />
          <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>Nothing needs attention</Text>
        </View>
      ) : (
        items.map((item) => {
          const opensTasks = item.id === 'overdue' || (item.taskIds?.length ?? 0) > 0;
          return (
            <AttentionCard
              key={item.id}
              item={item}
              // Swift passes `opensTasks: false` inside this List, because the row draws its own chevron.
              opensTasks={false}
              onPress={
                item.id === 'overdue'
                  ? () => router.push('/today/overdue')
                  : opensTasks
                    ? () => router.push({ pathname: '/today/schedule-check', params: { id: item.id } })
                    : undefined
              }
              testID={`attention-${item.id}`}
            />
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: 20, gap: 12 },
  centre: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  centred: { textAlign: 'center' },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
});
