import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { NexdoTask, ScheduleAttentionItem } from '../src/api';
import { TaskSymbol, Text } from '../src/components';
import { withAlpha } from '../src/components/SignInBackdrop';
import { overdueDay, overdueResults } from '../src/lib/overdueTasks';
import { parseServerDate } from '../src/lib/taskQuery';
import { useBlockDismiss } from '../src/lib/useBlockDismiss';
import { useScheduleIntelligence } from '../src/query/useToday';
import { isConflictCancelled, isStaleWrite, useCompleteTask, useTasks, type ScheduleConflict } from '../src/query/useTasks';
import { useAttentionSheet } from '../src/store/attention';
import { useFocus } from '../src/store/focus';
import { GlassCapsule } from '../src/components/PushedHeader';
import { useSheetSurface } from '../src/components/SheetSurface';
import { brand, useTheme } from '../src/theme';

/**
 * Port of `TodayAttentionSheet` (ios/App/TodayAttentionSheet.swift), `body` at `:17-100`, presented
 * from Today as a `.sheet` with `[.medium, .large]` detents and a drag indicator
 * (RootView.swift:1188-1191). Reference pattern 10.
 *
 * It REPLACES the pushed "Needs your attention" screen that used to live at this route
 * (`attentionDetails`, RootView.swift:1217-1245), which has no caller left in Swift since 63d9542.
 *
 * Presentation (`app/(tabs)/today/_layout.tsx`): a native `formSheet` with `sheetAllowedDetents
 * [0.5, 1.0]` — Material `BottomSheetBehavior` on Android, `UISheetPresentationController` on iOS.
 *
 * Platform substitutions:
 * - The sheet's `NavigationStack` pushes a schedule check's details (`:66-74`). A form sheet on Android
 *   cannot host a nested stack, so the details replace the list INSIDE the sheet, with a back chevron.
 * - `presentationDragIndicator(.visible)` is iOS-only in react-native-screens, so the grabber is drawn.
 * - The task editor (`.sheet(item: $editing)`, `:84-86`) is the existing `/task/[id]` modal; its
 *   `onDismiss` refresh runs when this sheet regains focus.
 */
export default function AttentionSheet() {
  const theme = useTheme({ elevated: true });
  const tasks = useTasks();
  const intelligence = useScheduleIntelligence();
  const saving = useAttentionSheet((state) => state.saving);
  const failure = useAttentionSheet((state) => state.failure);
  const setFailure = useAttentionSheet((state) => state.setFailure);
  const focusSession = useFocus((state) => state.session);
  const finishFocus = useFocus((state) => state.finishFocus);

  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);
  const complete = useCompleteTask({ onConflict: setConflict });
  const [check, setCheck] = useState<ScheduleAttentionItem | null>(null);

  // `@State` is per presentation in Swift: a fresh sheet starts with no failure.
  useEffect(() => useAttentionSheet.getState().reset, []);

  // `.interactiveDismissDisabled(saving)` (`:82`).
  useBlockDismiss(saving);

  // `OverdueTasks.results(model.tasks)` (`:13`) and the non-overdue attention items (`:14-16`).
  const overdue = overdueResults(tasks.data?.tasks ?? []);
  const checks = (intelligence.data?.today.attention ?? []).filter((item) => item.id !== 'overdue');
  const busy = complete.isPending;

  // `refetch` is stable across renders; the query objects are not, and depending on them would re-run
  // the focus effect below on every render.
  const refetchTasks = tasks.refetch;
  const refetchIntelligence = intelligence.refetch;
  const refresh = useCallback(() => {
    void refetchTasks();
    void refetchIntelligence();
  }, [refetchTasks, refetchIntelligence]);

  // The editor sheet's `onDismiss` (`:84`): refresh tasks and intelligence when this sheet is shown
  // again. The first focus is the presentation itself, which already has fresh data.
  const presented = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (presented.current) refresh();
      presented.current = true;
    }, [refresh]),
  );

  // `.alert` from `confirmScheduleWarnings` (NexdoApp.swift:87-98), as every task write shows it.
  if (conflict) {
    const pending = conflict;
    setConflict(null);
    Alert.alert('Review this time', pending.warnings.join('\n\n'), [
      { text: 'Keep previous schedule', style: 'cancel', onPress: pending.cancel },
      { text: 'Save anyway', onPress: pending.confirm },
    ]);
  }

  const edit = (task: NexdoTask) => router.push(`/task/${task.id}`);

  /** The circle button (`:29-38`): `changeTaskStatus(task, status: "COMPLETED")`, then intelligence. */
  const completeTask = async (task: NexdoTask) => {
    try {
      // `changeTaskStatus` ends a live focus session on the same task first (NexdoApp.swift:639).
      if (focusSession?.taskId === task.id) await finishFocus();
      await complete.mutateAsync(task);
      void intelligence.refetch();
    } catch (error) {
      if (isStaleWrite(error) || isConflictCancelled(error)) return;
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  // The glass card at `.medium`, the opaque grouped sheet at `.large` (pass 2).
  const surface = useSheetSurface();
  const section = { backgroundColor: surface.row };

  return (
    <View style={[styles.fill, { backgroundColor: surface.background }]} testID="attention-sheet">
      {Platform.OS === 'android' ? <View style={[styles.grabber, { backgroundColor: withAlpha(theme.colors.secondary, 0.5) }]} /> : null}
      {/* `.navigationTitle("Needs attention").navigationBarTitleDisplayMode(.inline)` with a
          `.confirmationAction` "Close", disabled while saving (`:80-81`). */}
      <View style={styles.bar}>
        <View style={styles.barSide}>
          {check ? (
            <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => setCheck(null)} testID="attention-check-back">
              <TaskSymbol color={theme.colors.tint} name="chevron.backward" size={20} />
            </Pressable>
          ) : null}
        </View>
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.barTitle, { color: theme.colors.label }]}>
          {check ? check.title : 'Needs attention'}
        </Text>
        <View style={[styles.barSide, styles.barRight]}>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            hitSlop={8}
            onPress={() => router.back()}
            testID="attention-close"
          >
            {/* A `.confirmationAction` on iOS 26 sits on a glass capsule. */}
            <GlassCapsule>
              <Text style={[styles.barButton, { color: theme.colors.tint, opacity: saving ? 0.35 : 1 }]}>Close</Text>
            </GlassCapsule>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        nestedScrollEnabled
        // `.refreshable { await model.refreshTasks(); await model.refreshScheduleIntelligence() }` (`:83`).
        refreshControl={<RefreshControl onRefresh={refresh} refreshing={tasks.isRefetching || intelligence.isRefetching} />}
      >
        {check ? (
          <CheckDetails check={check} onTask={edit} rowColor={surface.row} tasks={tasks.data?.tasks ?? []} />
        ) : (
          <>
            {overdue.length === 0 && checks.length === 0 ? (
              // `ContentUnavailableView("All caught up", systemImage: "checkmark.circle", description:)`
              <View accessible style={styles.empty} testID="attention-empty">
                <TaskSymbol color={theme.colors.secondary} name="checkmark.circle" size={44} />
                <Text style={[styles.emptyTitle, { color: theme.colors.label }]}>All caught up</Text>
                <Text style={[styles.body, styles.centred, { color: theme.colors.secondary }]}>Nothing needs attention right now.</Text>
              </View>
            ) : null}

            {tasks.isError ? (
              <Text style={[styles.body, styles.inset, { color: theme.colors.secondary }]} testID="attention-load-failed">
                Couldn’t refresh tasks. Pull down to retry.
              </Text>
            ) : null}

            {overdue.length > 0 ? (
              <>
                <Text style={[styles.header, { color: theme.colors.secondary }]} testID="attention-overdue-header">
                  {`${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`}
                </Text>
                <View style={[styles.section, section]}>
                  {overdue.map((task, index) => (
                    <OverdueRow
                      disabled={busy || saving}
                      divider={index > 0}
                      key={task.id}
                      onComplete={() => void completeTask(task)}
                      onEdit={() => edit(task)}
                      task={task}
                    />
                  ))}
                </View>

                <View style={[styles.section, section, styles.buttonSection]}>
                  {/* `Label("Reschedule all", systemImage: "calendar").font(.headline)` in a
                      `.borderedProminent` button, full width (`:57-60`). */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy || saving }}
                    disabled={busy || saving}
                    onPress={() => router.push('/reschedule-all')}
                    style={[styles.prominent, { backgroundColor: theme.colors.tint, opacity: busy || saving ? 0.45 : 1 }]}
                    testID="attention-reschedule-all"
                  >
                    <Text style={[styles.headline, { color: '#FFFFFF' }]}>Reschedule all</Text>
                  </Pressable>
                </View>
                <Text style={[styles.footer, { color: theme.colors.secondary }]}>Complete a task or choose a new date.</Text>
              </>
            ) : null}

            {checks.length > 0 ? (
              <>
                <Text style={[styles.header, { color: theme.colors.secondary }]}>Schedule checks</Text>
                <View style={[styles.section, section]}>
                  {checks.map((item, index) => (
                    <Pressable
                      accessibilityRole="button"
                      key={item.id}
                      onPress={() => setCheck(item)}
                      style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.separator }]}
                      testID={`attention-check-${item.id}`}
                    >
                      <Text style={[styles.headline, styles.grow, { color: theme.colors.label }]}>{item.title}</Text>
                      <TaskSymbol color={withAlpha(theme.colors.secondary, 0.6)} name="chevron.right" size={14} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}

        {/* `if let failure { Text(failure).foregroundStyle(.red) }` (`:78`). */}
        {failure !== null ? (
          <Text style={[styles.body, styles.inset, { color: theme.colors.danger }]} testID="attention-failure">
            {failure}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** One overdue task (`:27-53`): complete, open, and a reschedule button that also opens the editor. */
function OverdueRow({
  task,
  divider,
  disabled,
  onComplete,
  onEdit,
}: {
  task: NexdoTask;
  divider: boolean;
  disabled: boolean;
  onComplete: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme({ elevated: true });
  const due = parseServerDate(task.startAt ?? task.dueAt);
  return (
    <View style={[styles.taskRow, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.separator }]} testID={`attention-task-${task.id}`}>
      <Pressable
        accessibilityLabel={`Complete ${task.title}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onComplete}
        style={[styles.square44, { opacity: disabled ? 0.45 : 1 }]}
        testID={`attention-complete-${task.id}`}
      >
        {/* `Image(systemName: "circle").font(.title2)` in the tint. */}
        <TaskSymbol color={theme.colors.tint} name="circle" size={26} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onEdit} style={styles.grow} testID={`attention-open-${task.id}`}>
        <Text style={[styles.headline, { color: theme.colors.ink }]}>{task.title}</Text>
        {due !== null ? (
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{`Overdue · ${overdueDay(due)}`}</Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel={`Reschedule ${task.title}`}
        accessibilityRole="button"
        onPress={onEdit}
        // `.frame(width: 44, height: 44).background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))`
        style={[styles.square44, styles.calendarButton, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06) }]}
        testID={`attention-reschedule-${task.id}`}
      >
        <TaskSymbol color={theme.colors.tint} name="calendar" size={17} />
      </Pressable>
    </View>
  );
}

/** The pushed schedule check (`:66-74`): the explanation, the recommendation, and its tasks. */
function CheckDetails({ check, tasks, onTask, rowColor }: { check: ScheduleAttentionItem; tasks: NexdoTask[]; onTask: (task: NexdoTask) => void; rowColor: string }) {
  const theme = useTheme({ elevated: true });
  // `model.tasks.filter { check.taskIds?.contains($0.id) == true }` — list order, not id order.
  const affected = tasks.filter((task) => check.taskIds?.includes(task.id) === true);
  const rows = [
    <Text key="explanation" style={[styles.body, { color: theme.colors.label }]}>{check.explanation}</Text>,
    <Text key="recommended" style={[styles.body, { color: theme.colors.secondary }]}>{check.recommendedAction}</Text>,
    ...affected.map((task) => (
      <Pressable accessibilityRole="button" key={task.id} onPress={() => onTask(task)} testID={`attention-check-task-${task.id}`}>
        <Text style={[styles.body, { color: theme.colors.tint }]}>{task.title}</Text>
      </Pressable>
    )),
  ];
  return (
    <View style={[styles.section, { backgroundColor: rowColor }]} testID="attention-check-details">
      {rows.map((row, index) => (
        <View key={index} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.separator }]}>
          {row}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16 },
  barSide: { width: 104, flexDirection: 'row' },
  barRight: { justifyContent: 'flex-end' },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  barButton: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  // An inset-grouped `List` (style map §7, iOS 26 metrics): 16pt section inset, radius 26.
  scroll: { paddingBottom: 32 },
  section: { marginHorizontal: 16, borderRadius: 26, overflow: 'hidden' },
  // Measured on `today-attention-sheet-half`: 33pt between the sections, a 55pt button.
  buttonSection: { marginTop: 32, padding: 12 },
  header: { fontSize: 17, lineHeight: 22, fontWeight: '600', marginHorizontal: 32, marginTop: 12, marginBottom: 8 },
  footer: { fontSize: 13, lineHeight: 18, marginHorizontal: 32, marginTop: 8 },
  inset: { marginHorizontal: 32, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12 },
  // `.padding(.vertical, 4)` on an `HStack(spacing: 12)`.
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  square44: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  calendarButton: { borderRadius: 12 },
  prominent: { minHeight: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20, marginTop: 4 },
  body: { fontSize: 17, lineHeight: 22 },
  centred: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
});
