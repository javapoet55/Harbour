import { LinearGradient } from 'expo-linear-gradient';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { KeyboardAvoidingView, KeyboardAwareScrollView, NexdoTaskBackdrop, StickyFooter, TaskSymbol, Text } from '../../../src/components';
import { MonthCalendar } from '../../../src/components/MonthCalendar';
import { calendarKey } from '../../../src/lib/calendarDates';
import { serverTime } from '../../../src/lib/taskLabels';
import { startOfDay } from '../../../src/lib/taskQuery';
import { useCreateCalendarEvent } from '../../../src/query/useCalendar';
import { type ScheduleConflict } from '../../../src/query/useTasks';
import { useSession } from '../../../src/store/session';
import {
  ANDROID_LABEL_GAP,
  ANDROID_LABEL_ICON,
  androidChip,
  androidChipScroll,
  androidField,
  androidLabel,
  androidLabelRow,
  inputText,
  isAndroid,
  textStyles,
  useTheme,
} from '../../../src/theme';

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
  // `TaskCreationStyle` (RootView.swift:2190-2204). Its accent and input fill are NOT the app tint
  // and the grouped background: the accent is its own pair of literals, and the input fill is
  // `.tertiarySystemGroupedBackground`, which is #2C2C2E in dark mode where `groupedBackground` is
  // black. Both were visibly wrong here, the accent most of all at night.
  const accent = theme.scheme === 'dark' ? EDITOR_ACCENT_DARK : EDITOR_ACCENT_LIGHT;
  const inputFill = theme.scheme === 'dark' ? EDITOR_INPUT_DARK : EDITOR_INPUT_LIGHT;
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
  // Which input has focus, for the Android field's accent border (docs/android-polish.md §3).
  const [focused, setFocused] = useState<'title' | 'location' | 'notes' | null>(null);
  /** Android: every field here sits on the card, so it takes the raised field surface. */
  const field = (name: typeof focused) => androidField(theme, name !== null && focused === name, { raised: true });
  const capsule = androidField(theme, false, { raised: true, padded: false });
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
    // The keyboard OVERLAYS the window on this build rather than resizing it — measured on the
    // device: with the keyboard up, the notes field and the pinned footer both stayed at their
    // full-height positions while the keyboard covered everything below its top edge. So `padding`
    // is needed on Android too, not just iOS; without it the footer and any field below the fold sit
    // behind the keyboard with no way to reach them.
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <NexdoTaskBackdrop />
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
          <LabeledField title="APPOINTMENT / EVENT" icon="calendar" accent={accent}>
            <TextInput
              accessibilityLabel="Event title"
              placeholder="What’s on your calendar?"
              placeholderTextColor={theme.colors.placeholder}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setFocused('title')}
              onBlur={() => setFocused(null)}
              multiline
              style={[styles.input, styles.titleInput, { color: theme.colors.ink, backgroundColor: inputFill }, field('title')]}
              testID="event-title"
            />
          </LabeledField>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Create a calendar event or appointment.</Text>

          <Divider />
          <LabeledField title="SCHEDULE" icon="clock" accent={accent}>
            <FieldRow label="Starts" value={dateTimeLabel(start)} fill={inputFill} capsule={capsule} onPress={() => setPicking('start')} testID="event-start" />
          </LabeledField>
          <FieldRow label="Ends" value={dateTimeLabel(end)} fill={inputFill} capsule={capsule} onPress={() => setPicking('end')} testID="event-end" />
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>{zone}</Text>

          <Divider />
          <LabeledField title="REPEAT" icon="repeat" accent={accent}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Repeat"
              accessibilityValue={{ text: REPEAT_LABELS[repeatFrequency] }}
              onPress={() => setRepeatOpen((open) => !open)}
              // Android: a dropdown field like every other one (docs/android-polish.md §4).
              style={[styles.menuPicker, field(null), isAndroid() && styles.androidMenuPicker]}
              testID="event-repeat"
            >
              {/* `.pickerStyle(.menu)` (CalendarView.swift:541): the current value in the accent
                  colour with an up/down chevron, on the card — not a filled field. On Android it
                  is a filled field, with the value and chevron unchanged. */}
              <Text style={[theme.typography.body, { color: accent }]}>{REPEAT_LABELS[repeatFrequency]}</Text>
              <TaskSymbol name="chevron.down" size={13} color={accent} />
            </Pressable>
          </LabeledField>
          {repeatOpen ? (
            <View style={[styles.menu, { backgroundColor: inputFill }, capsule]} testID="event-repeat-menu">
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
                  {repeatFrequency === value ? <Text style={[theme.typography.body, { color: accent }]}>✓</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* The weekday grid, ordered Mon…Sat, Sun (CalendarView.swift:543). */}
          {repeatFrequency === 'weekdays' ? (
            <WeekdayRow>
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
                      // Android: a content-width chip in the row's horizontal scroll.
                      isAndroid() && styles.androidWeekday,
                      { backgroundColor: on ? accent : inputFill },
                      on ? null : capsule,
                    ]}
                  >
                    <Text numberOfLines={isAndroid() ? 1 : undefined} style={[styles.weekdayLabel, { color: on ? '#FFFFFF' : accent }]}>
                      {WEEKDAY_NAMES[day]}
                    </Text>
                  </Pressable>
                );
              })}
            </WeekdayRow>
          ) : null}

          {repeatFrequency !== 'none' ? (
            <>
              <FieldRow
                label="Repeat until"
                value={new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(repeatUntil))}
                fill={inputFill}
                capsule={capsule}
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
          <LabeledField title="LOCATION" icon="mappin.and.ellipse" accent={accent}>
            <TextInput
              accessibilityLabel="Location"
              placeholder="Add a location (optional)"
              placeholderTextColor={theme.colors.placeholder}
              value={location}
              onChangeText={setLocation}
              onFocus={() => setFocused('location')}
              onBlur={() => setFocused(null)}
              style={[styles.input, styles.bodyInput, { color: theme.colors.ink, backgroundColor: inputFill }, field('location')]}
              testID="event-location"
            />
          </LabeledField>

          <Divider />
          <LabeledField title="NOTES" icon="text.alignleft" accent={accent}>
            <TextInput
              accessibilityLabel="Notes"
              placeholder="Add details (optional)"
              placeholderTextColor={theme.colors.placeholder}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setFocused('notes')}
              onBlur={() => setFocused(null)}
              multiline
              style={[styles.input, styles.bodyInput, styles.notesInput, { color: theme.colors.ink, backgroundColor: inputFill }, field('notes')]}
              testID="event-notes"
            />
          </LabeledField>

          {failure !== null ? (
            <Text style={[styles.subheadline, { color: theme.colors.danger }]} testID="event-failure">
              {failure}
            </Text>
          ) : null}
        </View>
      </KeyboardAwareScrollView>

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
            <View style={[styles.saveButton, { backgroundColor: inputFill }]}>
              {/* `.foregroundStyle(canSave ? .white : Color.secondary)` on the whole HStack, which
                  still holds the arrow when disabled (CalendarView.swift:579-582). */}
              <Text style={[styles.saveLabel, { color: theme.colors.secondaryLabel }]}>Create Event</Text>
              <TaskSymbol name="arrow.right" size={17} color={theme.colors.secondaryLabel} />
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
    </KeyboardAvoidingView>
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

type EditorIcon = 'calendar' | 'clock' | 'repeat' | 'mappin.and.ellipse' | 'text.alignleft';

/**
 * `TaskEditorLabel` (RootView.swift:2207-2217). Android draws the one shared field label instead
 * (`androidLabel`, docs/android-polish.md §4), in place of the editor accent.
 */
function EditorLabel({ title, icon, accent }: { title: string; icon: EditorIcon; accent: string }) {
  const theme = useTheme();
  const android = isAndroid();
  return (
    <View style={[styles.editorLabel, android && androidLabelRow]}>
      <TaskSymbol name={icon} size={android ? ANDROID_LABEL_ICON : 13} color={android ? theme.colors.fieldLabel : accent} />
      <Text style={[styles.editorLabelText, { color: accent }, androidLabel(theme)]}>{title}</Text>
    </View>
  );
}

/**
 * A label and the field under it. On iOS the pair sits the card's 20 apart, exactly as when they
 * were siblings; on Android the label is 8 above its field.
 */
function LabeledField({ title, icon, accent, children }: { title: string; icon: EditorIcon; accent: string; children: React.ReactNode }) {
  return (
    <View style={isAndroid() ? styles.androidField : styles.labeledField}>
      <EditorLabel title={title} icon={icon} accent={accent} />
      {children}
    </View>
  );
}

/** Android: the card's 20 is cancelled so the chips scroll to its edges. */
const CHIP_SCROLL = androidChipScroll(20);

/** The weekday grid (CalendarView.swift:543): a wrapping grid on iOS, a horizontal chip row on Android. */
function WeekdayRow({ children }: { children: React.ReactNode }) {
  if (!isAndroid()) return <View style={styles.weekdays}>{children}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={CHIP_SCROLL.style}
      contentContainerStyle={CHIP_SCROLL.contentContainerStyle}
      testID="event-weekdays"
    >
      {children}
    </ScrollView>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />;
}

/**
 * A `DatePicker("Starts", selection:)` row (CalendarView.swift:530-531): the label sits on the card
 * itself and only the value gets the tinted capsule. Filling the whole row, as this did, drew a grey
 * band across the card that Swift does not have.
 */
function FieldRow({
  label,
  value,
  fill,
  capsule,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  fill: string;
  /** Android: the field surface and hairline on the value capsule (`androidField`, unpadded). */
  capsule?: StyleProp<ViewStyle>;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      onPress={onPress}
      style={styles.field}
      testID={testID}
    >
      <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{label}</Text>
      <View style={[styles.fieldValue, { backgroundColor: fill }, capsule]} testID={`${testID}-value`}>
        <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{value}</Text>
      </View>
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

/** `TaskCreationStyle.accent` (RootView.swift:2194-2198), rounded from its sRGB components. */
const EDITOR_ACCENT_LIGHT = '#3D29C7'; // UIColor(red: 0.24, green: 0.16, blue: 0.78)
const EDITOR_ACCENT_DARK = '#B8ADFF'; // UIColor(red: 0.72, green: 0.68, blue: 1)

/** `TaskCreationStyle.input` (RootView.swift:2192): `.tertiarySystemGroupedBackground`. */
const EDITOR_INPUT_LIGHT = '#F2F2F7';
const EDITOR_INPUT_DARK = '#2C2C2E';

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: 20 },
  card: { gap: 20, padding: 20, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth },
  editorLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // The card's own gap: a label and its field are 20 apart on iOS, as siblings were.
  labeledField: { gap: 20 },
  androidField: { gap: ANDROID_LABEL_GAP },
  editorLabelText: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8 },
  // `.padding(15).background(TaskCreationStyle.input, in: RoundedRectangle(cornerRadius: 15))` —
  // the fill carries the field; Swift draws no stroke on it (CalendarView.swift:524-525).
  input: { padding: 15, borderRadius: 15 },
  // `.font(.title3.weight(.semibold))`; `inputText` drops the line box, which a TextInput clips.
  titleInput: { ...inputText(textStyles.title3), fontWeight: '600', minHeight: 56 },
  bodyInput: inputText(textStyles.body),
  // `.lineLimit(3...6)` on a `.body` field: three 25pt lines plus the 15pt padding either side.
  notesInput: { minHeight: 105, maxHeight: 180, textAlignVertical: 'top' },
  caption: { fontSize: 12, lineHeight: 16 },
  subheadline: { fontSize: 15, lineHeight: 21 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  fieldValue: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  grow: { flex: 1 },
  menu: { borderRadius: 15, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 15 },
  menuPicker: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  // The field's 14 of vertical padding would make a 72pt row; the chips' height suits a picker.
  androidMenuPicker: { paddingVertical: 10, justifyContent: 'space-between' },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekday: { flexGrow: 1, flexBasis: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  androidWeekday: { ...androidChip, flexGrow: 0, flexBasis: 'auto' },
  weekdayLabel: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  // A bare `HStack` spaces by 8 (CalendarView.swift:579).
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 17 },
  saveLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { padding: 20, gap: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetDone: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  timeRow: { gap: 8, paddingVertical: 4 },
  timeSlot: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
});
