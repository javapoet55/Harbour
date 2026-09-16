import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCoordinator } from '../../src/actions/coordinator';
import { NextActionRow } from '../../src/components/TodayActions';
import { TaskSymbol } from '../../src/components/TaskSymbol';
import { Text } from '../../src/components/Text';
import { notificationDate, type StoredTaskAction } from '../../src/lib/taskAction';
import { buildActionQueue } from '../../src/lib/todayActionQueue';
import { useMe } from '../../src/query/useMe';
import { useTasks } from '../../src/query/useTasks';
import { useTheme } from '../../src/theme';

/**
 * `ActionQueueSheet` (ios/App/TodayActionsView.swift:188), **body `:193-220`**.
 *
 * Children followed: `NextActionRow` (`:165`, body `:168-186`), in `src/components/TodayActions.tsx`,
 * and `TaskActionView` (`:216-218`), which is `app/action/[id].tsx`.
 *
 * Swift rebuilds the queue inside a `TimelineView(.periodic(from: .now, by: 60))`, so the relative
 * labels tick over once a minute; the interval below is that timeline.
 */
export default function ActionQueue() {
  const theme = useTheme();
  const tasks = useTasks();
  const { data: profile } = useMe();
  const actions = useCoordinator((state) => state.actions);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const timeZone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const queue = buildActionQueue({ actions, tasks: tasks.data?.tasks ?? [], now, timeZone });

  // `let all = [queue.primaryAction].compactMap { $0 } + queue.nextActions + queue.laterActions`
  const all = [
    ...(queue.primaryAction ? [queue.primaryAction] : []),
    ...queue.nextActions,
    ...queue.laterActions,
  ] as StoredTaskAction[];

  const sections: { due: boolean; title: string }[] = [
    { due: true, title: 'Due now' },
    { due: false, title: 'Upcoming' },
  ];

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      <View style={styles.navBar}>
        <Text accessibilityRole="header" style={[styles.navTitle, styles.grow, { color: theme.colors.ink }]}>
          Nexdo Actions
        </Text>
        <Pressable accessibilityLabel="Done" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} testID="queue-done">
          <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Done</Text>
        </Pressable>
      </View>

      {all.length === 0 ? (
        /* `ContentUnavailableView("No actions today", systemImage: "checkmark.circle")` (`:213`). */
        <View style={styles.empty} testID="queue-empty">
          <TaskSymbol color={theme.colors.secondary} name="checkmark.circle" size={44} />
          <Text style={[styles.title2, { color: theme.colors.ink }]}>No actions today</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {sections.map((section) => {
            const rows = all.filter((action) => ((notificationDate(action) ?? Number.POSITIVE_INFINITY) <= now) === section.due);
            return (
              <View key={section.title} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.secondary }]}>{section.title.toUpperCase()}</Text>
                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
                  {rows.map((action, index) => (
                    <Pressable
                      accessibilityRole="button"
                      key={action.id}
                      onPress={() => {
                        useCoordinator.getState().open(action.id, action.preferredAction ?? null);
                      }}
                      style={styles.row}
                      testID={`queue-action-${action.id}`}
                    >
                      {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} /> : null}
                      <NextActionRow action={action} now={now} timeZone={timeZone} />
                      {/* `action.preferredAction?.rawValue.capitalized ?? "Call • Message • Email"` (`:209`). */}
                      <Text style={[styles.caption, { color: theme.colors.secondary }]}>
                        {action.preferredAction
                          ? action.preferredAction.charAt(0).toUpperCase() + action.preferredAction.slice(1)
                          : 'Call • Message • Email'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },

  navBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 14 },
  navTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },

  scroll: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', paddingHorizontal: 4 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  row: { gap: 4, paddingVertical: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
