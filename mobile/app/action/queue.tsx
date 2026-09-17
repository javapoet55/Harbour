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
  // `.sheet(isPresented: $showingAll) { ActionQueueSheet() }` (TodayActionsView.swift:44): iOS
  // resolves the system backgrounds one level up inside a sheet (style map section 3).
  const theme = useTheme({ elevated: true });
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
      {/* `.navigationTitle("Nexdo Actions").navigationBarTitleDisplayMode(.inline)` with a
          `.confirmationAction` Done (`:214`): an inline title is centred on both platforms. */}
      <View style={styles.navBar}>
        <View style={styles.navSide} />
        <Text accessibilityRole="header" style={[styles.navTitle, styles.grow, styles.centred, { color: theme.colors.ink }]}>
          Nexdo Actions
        </Text>
        <Pressable accessibilityLabel="Done" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.navSide} testID="queue-done">
          <Text style={[theme.typography.body, styles.trailing, { color: theme.colors.tint }]}>Done</Text>
        </Pressable>
      </View>

      {all.length === 0 ? (
        /* `ContentUnavailableView("No actions today", systemImage: "checkmark.circle")` (`:213`). */
        <View style={styles.empty} testID="queue-empty">
          {/* A `ContentUnavailableView` draws a ~52pt secondary glyph over a `.label` title. */}
          <TaskSymbol color={theme.colors.secondaryLabel} name="checkmark.circle" size={52} />
          <Text style={[styles.title2, { color: theme.colors.label }]}>No actions today</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {sections.map((section) => {
            const rows = all.filter((action) => ((notificationDate(action) ?? Number.POSITIVE_INFINITY) <= now) === section.due);
            return (
              <View key={section.title} style={styles.section}>
                {/* `Section("Due now")` / `Section("Upcoming")` (`:198`). A `List` header on
                    iOS 26 is sentence case in `.body` at `.secondaryLabel`, inset 32 from the
                    screen; uppercasing it is the tell of a pre-iOS-26 port (style map section 7). */}
                <Text style={[theme.typography.body, styles.sectionTitle, { color: theme.colors.secondaryLabel }]}>{section.title}</Text>
                {/* A `List` section has a fill and no stroke. */}
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
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
                      {/* A `List` row separator is `listSeparator` at 1pt, not a hairline `.separator`. */}
                      {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.colors.listSeparator }]} /> : null}
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
  centred: { textAlign: 'center' },
  trailing: { textAlign: 'right' },

  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  navSide: { width: 56 },
  navTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },

  // A `List` on iOS 26: sections inset 16, 26pt corners, 16pt row inset, header inset 32 overall.
  scroll: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { marginLeft: 16 },
  card: { borderRadius: 26, paddingHorizontal: 16 },
  row: { gap: 4, paddingVertical: 10, minHeight: 56 },
  divider: { height: 1, marginBottom: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
