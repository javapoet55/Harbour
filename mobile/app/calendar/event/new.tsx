import { LinearGradient } from 'expo-linear-gradient';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { NexdoTaskBackdrop, StickyFooter, TaskSymbol, Text } from '../../../src/components';
import { MonthCalendar } from '../../../src/components/MonthCalendar';
import { calendarKey } from '../../../src/lib/calendarDates';
import { serverTime } from '../../../src/lib/taskLabels';
import { startOfDay } from '../../../src/lib/taskQuery';
import { useCreateCalendarEvent } from '../../../src/query/useCalendar';
import { type ScheduleConflict } from '../../../src/query/useTasks';
import { useSession } from '../../../src/store/session';
import { useTheme } from '../../../src/theme';

/**
 * Port of `CalendarEventEditor` (ios/App/CalendarView.swift), built from `body` at `:518-588`.
 * Child view files followed: `NexdoTaskBackdrop` and `TaskEditorLabel` (`RootView.swift:2231`,
 * `:2207`), both ported in Phase 3.
 *
 * FIELD SET, which is smaller than the brief describes: title, start, end, repeat (with a weekday
 * grid and an until date), location and notes. There is **no all-day toggle, no attendees and no
 * calendar/account selection** in Swift.
 *
 * CREATE ONLY. Both call sites construct `CalendarEventEditor()` with no arguments
 * (`CalendarView.swift:162`, `RootView.swift:14`), it holds no event, and there is no update or
 * delete path anywhere in the app. So there is no edit route and no delete confirmation to port.
 */
export default function NewCalendarEvent() {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);
  const zone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // `start = now + 3600`, `end = now + 5400` (CalendarView.swift:509-510).
  const [mountedAt] = useState(() => Date.now());
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [start, setStart] = useState(() => mountedAt + 3_600_000);
  const [end, setEnd] = useState(() => mountedAt + 5_400_000);
  const [repeatFrequency, setRepeatFrequency] = useState('none');
  const [repeatUntil, setRepeatUntil] = useState(() => mountedAt + 90 * 86_400_000);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);
  const [picking, setPicking] = useState<'start' | 'end' | 'until' | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  // One id per submission, reused across a schedule-warning retry so a repeat series is not doubled.
  const [requestId] = useState(() => randomUUID());

  const create = useCreateCalendarEvent({ onConflict: setConflict });
  const saving = create.isPending;

  if (conflict) {
    const pending = conflict;
    setConflict(null);
    Alert.alert('Review this time', pending.warnings.join('\n\n'), [
      { text: 'Keep previous schedule', style: 'cancel', onPress: pending.cancel },
      { text: 'Save anyway', onPress: pending.confirm },
    ]);
  }

  /** `canSave` (CalendarView.swift:517). */
  const canSave =
    title.trim().length > 0 &&
    title.length <= 200 &&
    notes.length <= 4000 &&
    location.length <= 200 &&
    end > start &&
    end - start <= 7 * 86_400_000 &&
    (repeatFrequency !== 'weekdays' || weekdays.length > 0) &&
    !saving;

  /**
   * `.onChange(of: start)` (CalendarView.swift:587): moving the start drags the end with it, keeping
   * at least five minutes between them, and clamps `repeatUntil` into the allowed year.
   */
  const moveStart = (next: number) => {
    setEnd((currentEnd) => next + Math.max(300_000, currentEnd - start));
    setRepeatUntil((current) => Math.max(next, Math.min(current, next + 365 * 86_400_000)));
    setStart(next);
  };

  /** `saveEvent()` (CalendarView.swift:591-608). */
  const save = () => {
    if (!canSave) return;
    // `guard start > Date()` — checked before the request, with its own message.
    if (start <= Date.now()) {
      setFailure('Choose a future start time.');
      return;
    }
    setFailure(null);
    create.mutate(
      {
        requestId,
        title: title.trim(),
        notes,
        location,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        ...(repeatFrequency !== 'none'
          ? { repeat: { frequency: repeatFrequency, until: calendarKey(repeatUntil, zone), weekdays: [...weekdays].sort((a, b) => a - b) } }
          : {}),
      },
      {
        onSuccess: () => router.back(),
        onError: (error) => {
          if (error.name === 'ScheduleConflictCancelled') return;
          setFailure(error.message);
        },
      },
    );
  };

  const dateTimeLabel = (at: number) =>
    `${new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(at))} ${serverTime(new Date(at).toISOString(), zone)}`;

  return (
    <View style={styles.fill}>
      <NexdoTaskBackdrop />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
          <EditorLabel title="APPOINTMENT / EVENT" icon="calendar" />
          <TextInput
            accessibilityLabel="Event title"
            placeholder="What’s on your calendar?"
            placeholderTextColor={theme.colors.secondary}
            value={title}
            onChangeText={setTitle}
            multiline
            style={[styles.input, styles.titleInput, { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator }]}
            testID="event-title"
          />
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Create a calendar event or appointment.</Text>

          <Divider />
          <EditorLabel title="SCHEDULE" icon="clock" />
          <FieldRow label="Starts" value={dateTimeLabel(start)} onPress={() => setPicking('start')} testID="event-start" />
          <FieldRow label="Ends" value={dateTimeLabel(end)} onPress={() => setPicking('end')} testID="event-end" />
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>{zone}</Text>

          <Divider />
          <EditorLabel title="REPEAT" icon="repeat" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Repeat"
            accessibilityValue={{ text: REPEAT_LABELS[repeatFrequency] }}
            onPress={() => setRepeatOpen((open) => !open)}
            style={[styles.field, { backgroundColor: theme.colors.groupedBackground }]}
            testID="event-repeat"
          >
            <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{REPEAT_LABELS[repeatFrequency]}</Text>
            <TaskSymbol name="chevron.down" size={13} color={theme.colors.secondary} />
          </Pressable>
          {repeatOpen ? (
            <View style={[styles.menu, { backgroundColor: theme.colors.groupedBackground }]}>
              {Object.entries(REPEAT_LABELS).map(([value, name]) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ selected: repeatFrequency === value }}
                  onPress={() => {
                    setRepeatFrequency(value);
                    setRepeatOpen(false);
                  }}
                  style={styles.menuRow}
                  testID={`event-repeat-${value}`}
                >
                  <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{name}</Text>
                  {repeatFrequency === value ? <Text style={[theme.typography.body, { color: theme.colors.tint }]}>✓</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* The weekday grid, ordered Mon…Sat, Sun (CalendarView.swift:543). */}
          {repeatFrequency === 'weekdays' ? (
            <View style={styles.weekdays}>
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const on = weekdays.includes(day);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={WEEKDAY_NAMES[day]}
                    accessibilityState={{ selected: on }}
                    onPress={() => setWeekdays((current) => (on ? current.filter((each) => each !== day) : [...current, day]))}
                    testID={`event-weekday-${day}`}
                    style={[
                      styles.weekday,
                      { backgroundColor: on ? theme.colors.tint : theme.colors.groupedBackground },
                    ]}
                  >
                    <Text style={[styles.weekdayLabel, { color: on ? '#FFFFFF' : theme.colors.tint }]}>{WEEKDAY_NAMES[day]}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {repeatFrequency !== 'none' ? (
            <>
              <FieldRow
                label="Repeat until"
                value={new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(repeatUntil))}
                onPress={() => setPicking('until')}
                testID="event-repeat-until"
              />
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>
                {repeatFrequency === 'monthly'
                  ? 'Repeats on the same date each month. Months without that date are skipped.'
                  : 'Repeats at the same local time through this date.'}
              </Text>
            </>
          ) : null}

          <Divider />
          <EditorLabel title="LOCATION" icon="mappin.and.ellipse" />
          <TextInput
            accessibilityLabel="Location"
            placeholder="Add a location (optional)"
            placeholderTextColor={theme.colors.secondary}
            value={location}
            onChangeText={setLocation}
            style={[styles.input, { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator }]}
            testID="event-location"
          />

          <Divider />
          <EditorLabel title="NOTES" icon="text.alignleft" />
          <TextInput
            accessibilityLabel="Notes"
            placeholder="Add details (optional)"
            placeholderTextColor={theme.colors.secondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            style={[styles.input, styles.notesInput, { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator }]}
            testID="event-notes"
          />

          {failure !== null ? (
            <Text style={[styles.subheadline, { color: theme.colors.danger }]} testID="event-failure">
              {failure}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* `.safeAreaInset(edge: .bottom)` (CalendarView.swift:578-586) */}
      <StickyFooter background={theme.colors.surface}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saving ? 'Creating…' : 'Create Event'}
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={save}
          testID="event-create"
        >
          {canSave ? (
            <LinearGradient colors={SELECTED_GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.saveButton}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={[styles.saveLabel, { color: '#FFFFFF' }]}>{saving ? 'Creating…' : 'Create Event'}</Text>
              <TaskSymbol name="arrow.right" size={17} color="#FFFFFF" />
            </LinearGradient>
          ) : (
            <View style={[styles.saveButton, { backgroundColor: theme.colors.groupedBackground }]}>
              <Text style={[styles.saveLabel, { color: theme.colors.secondary }]}>Create Event</Text>
            </View>
          )}
        </Pressable>
      </StickyFooter>

      {/* The three `DatePicker`s, as sheets. See Visual gaps: Swift uses inline system pickers. */}
      <Modal visible={picking !== null} animationType="slide" transparent onRequestClose={() => setPicking(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.sheetBar}>
              <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.ink }]}>
                {picking === 'start' ? 'Starts' : picking === 'end' ? 'Ends' : 'Repeat until'}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => setPicking(null)} style={styles.sheetDone} testID="event-picker-done">
                <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Done</Text>
              </Pressable>
            </View>
            {picking !== null ? (
              <>
                <MonthCalendar
                  selected={picking === 'start' ? start : picking === 'end' ? end : repeatUntil}
                  onSelect={(next) => {
                    if (picking === 'start') moveStart(next);
                    else if (picking === 'end') setEnd(next);
                    else setRepeatUntil(next);
                  }}
                  timeZone={zone}
                />
                {picking !== 'until' ? (
                  <TimeRow
                    selected={picking === 'start' ? start : end}
                    timeZone={zone}
                    onSelect={(next) => (picking === 'start' ? moveStart(next) : setEnd(next))}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Half-hour slots, as on the task detail's schedule picker. */
function TimeRow({ selected, timeZone, onSelect }: { selected: number; timeZone: string; onSelect: (next: number) => void }) {
  const theme = useTheme();
  const midnight = startOfDay(selected, timeZone);
  const currentSlot = Math.floor((selected - midnight) / 1_800_000);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeRow}>
      {Array.from({ length: 48 }, (_, slot) => {
        const at = midnight + slot * 1_800_000;
        const isSelected = slot === currentSlot;
        return (
          <Pressable
            key={slot}
            accessibilityRole="button"
            accessibilityLabel={serverTime(new Date(at).toISOString(), timeZone)}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(at)}
            testID={`event-time-${slot}`}
            style={[styles.timeSlot, isSelected && { backgroundColor: theme.colors.tint }]}
          >
            <Text style={[styles.caption, { color: isSelected ? '#FFFFFF' : theme.colors.ink }]}>
              {serverTime(new Date(at).toISOString(), timeZone)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** `TaskEditorLabel` (RootView.swift:2207-2217). */
function EditorLabel({ title, icon }: { title: string; icon: 'calendar' | 'clock' | 'repeat' | 'mappin.and.ellipse' | 'text.alignleft' }) {
  const theme = useTheme();
  return (
    <View style={styles.editorLabel}>
      <TaskSymbol name={icon} size={13} color={theme.colors.tint} />
      <Text style={[styles.editorLabelText, { color: theme.colors.tint }]}>{title}</Text>
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />;
}

function FieldRow({ label, value, onPress, testID }: { label: string; value: string; onPress: () => void; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      onPress={onPress}
      style={[styles.field, { backgroundColor: theme.colors.groupedBackground }]}
      testID={testID}
    >
      <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{label}</Text>
      <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>{value}</Text>
    </Pressable>
  );
}

/** The `Picker` options (CalendarView.swift:535-541). */
const REPEAT_LABELS: Record<string, string> = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  weekdays: 'Particular days of the week',
};

/** Indexed by the Swift weekday number, 0 = Sunday (CalendarView.swift:546). */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `TaskCreationStyle.selectedGradient` (RootView.swift:2199-2203). */
const SELECTED_GRADIENT = ['#91198A', '#5930BF', '#144DAD'] as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: 20 },
  card: { gap: 20, padding: 20, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth },
  editorLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  editorLabelText: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8 },
  input: { padding: 15, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  titleInput: { fontSize: 20, lineHeight: 25, fontWeight: '600', minHeight: 56 },
  notesInput: { fontSize: 17, lineHeight: 22, minHeight: 88, textAlignVertical: 'top' },
  caption: { fontSize: 12, lineHeight: 16 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 15, borderRadius: 15 },
  grow: { flex: 1 },
  menu: { borderRadius: 15, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 15 },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekday: { flexGrow: 1, flexBasis: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  weekdayLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, borderRadius: 17 },
  saveLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { padding: 20, gap: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetDone: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  timeRow: { gap: 8, paddingVertical: 4 },
  timeSlot: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
});
