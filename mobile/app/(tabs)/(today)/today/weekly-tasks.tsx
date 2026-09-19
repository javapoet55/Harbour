import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { NexdoTask } from '../../../../src/api';
import { Text } from '../../../../src/components';
import { TaskListRow } from '../../../../src/components/ProjectParts';
import { parseServerDate } from '../../../../src/lib/taskQuery';
import { taskRangeLabel, WEEKLY_TASK_FILTERS, type WeeklyTaskFilter } from '../../../../src/lib/weeklySummary';
import { useWeeklySummary } from '../../../../src/query/useToday';
import { useTheme } from '../../../../src/theme';

/**
 * Port of `WeeklySummaryTasksView` (ios/App/WeeklySummaryView.swift), built from `body` at `:264-315`.
 * Child view files followed: `TaskListRow` (`ios/App/ProjectsView.swift:316`), already ported in
 * Phase 3 — Swift reuses the projects row here rather than defining a new one.
 *
 * Swift receives the whole `WeeklySummary` object through the `NavigationLink`. A route cannot carry
 * an object, so this takes the week start and the initial filter as params and reads the summary from
 * the same cache the previous screen filled — no second request in practice.
 */
export default function WeeklyTasks() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ start?: string; filter?: string }>();
  const start = params.start ?? '';

  const query = useWeeklySummary(start);
  const summary = query.data ?? null;

  const [filter, setFilter] = useState<WeeklyTaskFilter>(
    WEEKLY_TASK_FILTERS.includes(params.filter as WeeklyTaskFilter) ? (params.filter as WeeklyTaskFilter) : 'Completed',
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  /** `tasks` (WeeklySummaryView.swift:255-262). */
  const groups = summary?.taskGroups ?? null;
  const tasks: NexdoTask[] | null = groups
    ? filter === 'Completed'
      ? groups.completed
      : filter === 'Planned'
        ? groups.planned.filter((task) => task.status === 'PLANNED')
        : groups.overdue
    : null;

  /** `taskSubtitle(_:)` (WeeklySummaryView.swift:326-332). */
  const subtitleFor = (task: NexdoTask) => {
    const due = parseServerDate(task.dueAt);
    const label =
      due === null
        ? 'No due date'
        : new Intl.DateTimeFormat('en-US', {
            timeZone: summary?.timeZone,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }).format(new Date(due));
    return `${task.durationMin} min · ${label}`;
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.groupedBackground }}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {/* `.navigationTitle("\(filter.rawValue) tasks")` (WeeklySummaryView.swift:307): the title
          follows the filter — "Completed tasks", "Overdue tasks" — and is not a static "Tasks". It
          is set here rather than in `_layout.tsx` because it depends on this screen's own state. */}
      <Stack.Screen options={{ title: `${filter} tasks` }} />
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.row}>
          <Text style={[styles.heading, { color: theme.colors.ink }]} testID="weekly-tasks-range">
            {summary ? taskRangeLabel(summary.start, summary.end, summary.timeZone) : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tasks in this week"
          accessibilityValue={{ text: filter }}
          onPress={() => setPickerOpen((open) => !open)}
          style={styles.row}
          testID="weekly-tasks-filter"
        >
          <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>Tasks in this week</Text>
          <Text style={[theme.typography.body, { color: theme.colors.tint }]}>{filter}</Text>
        </Pressable>
        {pickerOpen
          ? WEEKLY_TASK_FILTERS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={option}
                accessibilityState={{ selected: filter === option }}
                onPress={() => {
                  setFilter(option);
                  setPickerOpen(false);
                }}
                style={styles.row}
                testID={`weekly-tasks-filter-${option}`}
              >
                <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{option}</Text>
                {filter === option ? <Text style={[theme.typography.body, { color: theme.colors.tint }]}>✓</Text> : null}
              </Pressable>
            ))
          : null}
        {filter === 'Overdue' ? (
          <View style={styles.row}>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>
              Overdue within this week’s planned tasks, as of the report. A task may have been completed since then.
            </Text>
          </View>
        ) : null}
      </View>

      {tasks === null ? (
        query.isError ? (
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.row}>
              <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>
                Couldn’t load this week’s tasks. Please try again.
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={() => void query.refetch()} style={styles.row} testID="weekly-tasks-retry">
              <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Loading tasks…</Text>
          </View>
        )
      ) : (
        <>
          <Text style={[styles.sectionHeader, { color: theme.colors.secondary }]} testID="weekly-tasks-count">
            {`${tasks.length} ${filter.toLowerCase()} tasks`.toUpperCase()}
          </Text>
          {tasks.length === 0 ? (
            <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.row}>
                <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>
                  {`No ${filter.toLowerCase()} tasks for this period.`}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.list}>
              {tasks.map((task) => (
                <TaskListRow key={task.id} task={task} subtitle={subtitleFor(task)} onPress={() => router.push(`/task/${task.id}`)} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: 18, gap: 8 },
  section: { marginHorizontal: 20, borderRadius: 10, overflow: 'hidden' },
  sectionHeader: { fontSize: 13, lineHeight: 18, marginHorizontal: 36, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  grow: { flex: 1 },
  list: { paddingHorizontal: 20, gap: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
});
