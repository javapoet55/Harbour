import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TaskSymbol, Text } from '../../../src/components';
import { parseServerDate } from '../../../src/lib/taskQuery';
import { useTasks } from '../../../src/query/useTasks';
import { useScheduleIntelligence } from '../../../src/query/useToday';
import { useTheme } from '../../../src/theme';

/**
 * Port of `scheduleCheckDetails(_:)` (ios/App/RootView.swift:1233-1259), a private func on
 * `TodayView`. Child view files followed: none — the rows are inline, and the destination is the
 * existing task detail.
 *
 * Swift receives the `AttentionItem` through the navigation destination. A route cannot carry an
 * object, so this takes the item id and reads it back out of the schedule-intelligence cache.
 */
export default function ScheduleCheck() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const intelligence = useScheduleIntelligence();
  const tasks = useTasks();

  const item = intelligence.data?.today.attention.find((candidate) => candidate.id === id) ?? null;
  const zone = intelligence.data?.today.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** `let tasks = (item.taskIds ?? []).compactMap { … }` (RootView.swift:1234) */
  const affected = (item?.taskIds ?? [])
    .map((taskId) => tasks.data?.tasks.find((task) => task.id === taskId))
    .filter((task): task is NonNullable<typeof task> => task !== undefined);

  /** `scheduleCheckDeadline(_:)` (RootView.swift:1257-1259): time only. */
  const deadline = (value: string) => {
    const at = parseServerDate(value);
    if (at === null) return value;
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  };

  if (!item) {
    return (
      <View style={[styles.fill, styles.centre, { backgroundColor: theme.colors.groupedBackground }]}>
        <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondary }]}>
          This schedule check is no longer available.
        </Text>
      </View>
    );
  }

  // `Section(item.requiredMinutes.flatMap { … } ?? "Tasks in this schedule check")` (RootView.swift:1240)
  const sectionTitle =
    item.requiredMinutes !== null && item.requiredMinutes !== undefined && item.deadlineAt
      ? `Tasks needing ${item.requiredMinutes} minutes by ${deadline(item.deadlineAt)}`
      : 'Tasks in this schedule check';

  return (
    <ScrollView style={{ backgroundColor: theme.colors.groupedBackground }} contentContainerStyle={styles.scroll}>
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.row}>
          <Text style={[theme.typography.body, { color: theme.colors.ink }]} testID="check-explanation">
            {item.explanation}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]} testID="check-action">
            {item.recommendedAction}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionHeader, { color: theme.colors.secondary }]} testID="check-section-title">
        {sectionTitle.toUpperCase()}
      </Text>
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        {affected.length === 0 ? (
          <View style={styles.row}>
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>
              The affected tasks are no longer available.
            </Text>
          </View>
        ) : (
          affected.map((task, index) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              accessibilityLabel={task.title}
              onPress={() => router.push(`/task/${task.id}`)}
              testID={`check-task-${task.id}`}
              style={[
                styles.row,
                index < affected.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator },
              ]}
            >
              <View style={styles.grow}>
                <Text style={[styles.taskTitle, { color: theme.colors.ink }]}>{task.title}</Text>
                <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
                  {`${task.durationMin} minutes${task.dueAt ? ` · due ${deadline(task.dueAt)}` : ''}`}
                </Text>
              </View>
              <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} />
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingVertical: 18, gap: 8 },
  section: { marginHorizontal: 20, borderRadius: 10, overflow: 'hidden' },
  sectionHeader: { fontSize: 13, lineHeight: 18, marginHorizontal: 36, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  taskTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  grow: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centred: { textAlign: 'center' },
});
