import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../src/components';
import { MonthCalendar } from '../src/components/MonthCalendar';
import { withAlpha } from '../src/components/SignInBackdrop';
import { overdueResults } from '../src/lib/overdueTasks';
import { canReschedule, rescheduleAll, rescheduleButtonTitle, SCHEDULE_SAVE_FAILED } from '../src/lib/rescheduleAll';
import { startOfDay } from '../src/lib/taskQuery';
import { useBlockDismiss } from '../src/lib/useBlockDismiss';
import { useScheduleIntelligence } from '../src/query/useToday';
import { isConflictCancelled, useTasks, useUpdateTask, type ScheduleConflict } from '../src/query/useTasks';
import { useAttentionSheet } from '../src/store/attention';
import { GlassCapsule } from '../src/components/PushedHeader';
import { useSheetSurface } from '../src/components/SheetSurface';
import { useTheme } from '../src/theme';

/**
 * Port of the "Reschedule all" form (ios/App/TodayAttentionSheet.swift:87-98) and `rescheduleAll()`
 * (`:102-125`, logic in `src/lib/rescheduleAll.ts`). A second `.sheet` with `[.medium, .large]`
 * detents, presented from Needs attention; a `formSheet` here, like its parent.
 *
 * The `DatePicker("Start at", selection:, in: Date()...)` is the device's zone and minute precision.
 * Its compact date and time capsules open inline pickers: the month grid the task and event editors
 * already use, and hour and minute rows. The grid does not grey out past days as `in: Date()...`
 * does, so a past start is refused by the button's `start <= Date()` guard instead.
 */
export default function RescheduleAll() {
  const theme = useTheme({ elevated: true });
  const tasks = useTasks();
  const intelligence = useScheduleIntelligence();
  const saving = useAttentionSheet((state) => state.saving);
  const failure = useAttentionSheet((state) => state.failure);
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);
  const update = useUpdateTask({ onConflict: setConflict });
  const surface = useSheetSurface(0, { stacked: true });

  // `start = Date().addingTimeInterval(3600)` when the sheet opens (`:57`).
  const [start, setStart] = useState(() => Date.now() + 3_600_000);
  const [picking, setPicking] = useState<'date' | 'time' | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // `.interactiveDismissDisabled(saving)` (`:97`).
  useBlockDismiss(saving);

  const overdue = overdueResults(tasks.data?.tasks ?? []);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const enabled = canReschedule({ saving, busy: update.isPending, count: overdue.length, start, now });

  if (conflict) {
    const pending = conflict;
    setConflict(null);
    Alert.alert('Review this time', pending.warnings.join('\n\n'), [
      { text: 'Keep previous schedule', style: 'cancel', onPress: pending.cancel },
      { text: 'Save anyway', onPress: pending.confirm },
    ]);
  }

  const run = async () => {
    // `guard !saving, start > Date() else { return }`
    if (useAttentionSheet.getState().saving || start <= Date.now()) return;
    const store = useAttentionSheet.getState();
    store.setSaving(true);
    store.setFailure(null);
    try {
      const result = await rescheduleAll(
        overdue,
        start,
        async (write) => {
          await update.mutateAsync(write);
        },
        // A cancelled conflict prompt is rethrown by Swift unchanged; every other schedule error is
        // `TaskEditError.schedule` (NexdoApp.swift:632-633).
        (error) => (isConflictCancelled(error) && error instanceof Error ? error.message : SCHEDULE_SAVE_FAILED),
      );
      if (result !== null) {
        store.setFailure(result);
        void tasks.refetch();
        return;
      }
      // `rescheduling = false`, then refresh tasks and intelligence.
      router.back();
      void tasks.refetch();
      void intelligence.refetch();
    } finally {
      useAttentionSheet.getState().setSaving(false);
    }
  };

  const separator = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.separator };

  return (
    <View style={[styles.fill, { backgroundColor: surface.background }]} testID="reschedule-all-sheet">
      {Platform.OS === 'android' ? <View style={[styles.grabber, { backgroundColor: withAlpha(theme.colors.secondary, 0.5) }]} /> : null}
      {/* `.navigationTitle("Reschedule all")`, inline, with a `.cancellationAction` Cancel (`:95-96`). */}
      <View style={styles.bar}>
        <View style={styles.barSide}>
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            hitSlop={8}
            onPress={() => router.back()}
            testID="reschedule-cancel"
          >
            <GlassCapsule>
              <Text style={[styles.barButton, { color: theme.colors.tint, opacity: saving ? 0.35 : 1 }]}>Cancel</Text>
            </GlassCapsule>
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={[styles.barTitle, { color: theme.colors.label }]}>
          Reschedule all
        </Text>
        <View style={styles.barSide} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled>
        <View style={[styles.section, { backgroundColor: surface.row }]}>
          <View style={styles.row}>
            <Text style={[styles.body, styles.grow, { color: theme.colors.label }]}>Start at</Text>
            <Capsule label={dateLabel(start)} onPress={() => setPicking(picking === 'date' ? null : 'date')} selected={picking === 'date'} testID="reschedule-date" />
            <Capsule label={timeLabel(start)} onPress={() => setPicking(picking === 'time' ? null : 'time')} selected={picking === 'time'} testID="reschedule-time" />
          </View>
          {picking === 'date' ? (
            <View style={styles.picker}>
              <MonthCalendar onSelect={setStart} selected={start} timeZone={zone} />
            </View>
          ) : null}
          {picking === 'time' ? <TimePicker onSelect={setStart} selected={start} timeZone={zone} /> : null}

          <View style={[styles.row, separator]}>
            <Text style={[styles.body, { color: theme.colors.label }]}>
              Schedule overdue tasks one after another, using each task’s duration. Existing calendar events are not moved.
            </Text>
          </View>
          {failure !== null ? (
            <View style={[styles.row, separator]}>
              <Text style={[styles.body, { color: theme.colors.danger }]} testID="reschedule-failure">
                {failure}
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled }}
            disabled={!enabled}
            onPress={() => void run()}
            style={[styles.row, separator]}
            testID="reschedule-submit"
          >
            <Text style={[styles.body, { color: enabled ? theme.colors.tint : theme.colors.secondary }]}>
              {rescheduleButtonTitle(saving, overdue.length)}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

/** The compact `DatePicker`'s grey value capsule. */
function Capsule({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const theme = useTheme({ elevated: true });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      // The compact picker's pill: system grey (118, 118, 128) at ~24%, measured in both schemes.
      style={[styles.capsule, { backgroundColor: withAlpha('#767680', 0.24) }]}
      testID={testID}
    >
      <Text style={[styles.body, { color: selected ? theme.colors.tint : theme.colors.label }]}>{label}</Text>
    </Pressable>
  );
}

/** Hours and minutes of the selected day, in the device zone, one minute apart as the picker allows. */
function TimePicker({ selected, timeZone, onSelect }: { selected: number; timeZone: string; onSelect: (next: number) => void }) {
  const theme = useTheme({ elevated: true });
  const midnight = startOfDay(selected, timeZone);
  const minutes = Math.round((selected - midnight) / 60_000);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const set = (h: number, m: number) => onSelect(midnight + (h * 60 + m) * 60_000);
  const chip = (value: number, active: boolean, onPress: () => void, testID: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      key={value}
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: theme.colors.tint }]}
      testID={testID}
    >
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : theme.colors.label }]}>{String(value).padStart(2, '0')}</Text>
    </Pressable>
  );
  return (
    <View style={styles.picker}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {Array.from({ length: 24 }, (_, h) => chip(h, h === hour, () => set(h, minute), `reschedule-hour-${h}`))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {Array.from({ length: 60 }, (_, m) => chip(m, m === minute, () => set(hour, m), `reschedule-minute-${m}`))}
      </ScrollView>
    </View>
  );
}

/** The compact picker's date: the device locale's medium date, "19 Sep 2026" on the capture. */
function dateLabel(at: number): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(at));
}

function timeLabel(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16 },
  // Wide enough for a glass capsule around "Cancel" on one line.
  barSide: { width: 104 },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  barButton: { fontSize: 17, lineHeight: 22 },
  // A `Form` on iOS 26 (style map §7): 16pt inset, radius 26, 35pt below the bar.
  scroll: { paddingTop: 20, paddingBottom: 32 },
  section: { marginHorizontal: 16, borderRadius: 26, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 },
  body: { fontSize: 17, lineHeight: 22 },
  capsule: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  picker: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  chips: { gap: 6, paddingHorizontal: 4 },
  chip: { minWidth: 44, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
});
