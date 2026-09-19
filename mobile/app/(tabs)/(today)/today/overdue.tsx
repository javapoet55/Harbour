import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { TaskSymbol, Text } from '../../../../src/components';
import { overdueDeadlineLabel, overdueResults } from '../../../../src/lib/overdueTasks';
import { parseServerDate } from '../../../../src/lib/taskQuery';
import { useTasks } from '../../../../src/query/useTasks';
import { useSession } from '../../../../src/store/session';
import { useTheme } from '../../../../src/theme';

/**
 * Port of `OverdueTasksView` (ios/App/OverdueTasksView.swift), built from `body` at `:15-69`.
 * Child view files followed: none — the row is inline, and `TaskEditor` is the existing task detail.
 *
 * `TimelineView(.periodic(by: 60))` recomputes the list every minute, because membership depends on
 * `now`: a task whose deadline passes while the screen is open must appear without a refetch.
 */
export default function Overdue() {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);
  const tasks = useTasks();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const loaded = tasks.data;
  const overdue = overdueResults(loaded?.tasks ?? [], now);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.groupedBackground }}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={tasks.isRefetching} onRefresh={() => void tasks.refetch()} />}
    >
      {tasks.isError ? (
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <Text style={[theme.typography.body, { color: theme.colors.ink }]}>
            Couldn’t refresh overdue tasks. Showing the available tasks.
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={() => void tasks.refetch()} style={styles.retry} testID="overdue-retry">
            <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {overdue.length === 0 ? (
        tasks.isLoading ? (
          <View style={styles.centre}>
            <ActivityIndicator />
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Loading overdue tasks…</Text>
          </View>
        ) : !tasks.isError ? (
          <View accessible style={styles.centre} testID="overdue-empty">
            <TaskSymbol name="checkmark.circle.fill" size={38} color={theme.colors.secondary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>No unfinished deadlines</Text>
            <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondary }]}>
              You have no overdue tasks.
            </Text>
          </View>
        ) : null
      ) : (
        <>
          <Text style={[styles.sectionHeader, { color: theme.colors.secondary }]} testID="overdue-count">
            {`${overdue.length} unfinished ${overdue.length === 1 ? 'deadline' : 'deadlines'}`.toUpperCase()}
          </Text>
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            {overdue.map((task, index) => {
              const at = parseServerDate(task.startAt ?? task.dueAt);
              const zone = profile?.timeZone ?? task.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
              return (
                <Pressable
                  key={task.id}
                  accessibilityRole="button"
                  accessibilityHint="Opens task details to complete or reschedule"
                  onPress={() => router.push(`/task/${task.id}`)}
                  testID={`overdue-row-${task.id}`}
                  style={[
                    styles.row,
                    index < overdue.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator },
                  ]}
                >
                  <View style={styles.grow}>
                    <Text style={[styles.rowTitle, { color: theme.colors.ink }]}>{task.title}</Text>
                    {at !== null ? (
                      <Text style={[styles.rowDue, { color: theme.colors.danger }]}>
                        {`Due ${overdueDeadlineLabel(at, zone)}`}
                      </Text>
                    ) : null}
                  </View>
                  <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} />
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: 18, gap: 8 },
  sectionHeader: { fontSize: 13, lineHeight: 18, marginHorizontal: 36 },
  section: { marginHorizontal: 20, borderRadius: 10, overflow: 'hidden' },
  // `.padding(.vertical, 6)` inside a List row, which supplies its own insets.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 },
  rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  rowDue: { fontSize: 15, lineHeight: 20, marginTop: 6 },
  grow: { flex: 1 },
  centre: { alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 24 },
  centred: { textAlign: 'center' },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
});
