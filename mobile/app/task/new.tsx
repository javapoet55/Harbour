import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { KeyboardAvoidingView, KeyboardAwareScrollView, NexdoTaskBackdrop, StickyFooter, TaskSymbol, Text } from '../../src/components';
import { MonthCalendar } from '../../src/components/MonthCalendar';
import { ProjectAssignmentField } from '../../src/components/ProjectAssignmentField';
import { detectTaskAction } from '../../src/lib/taskActionDetector';
import { creationDateFor, TASK_CREATION_DATES, type TaskCreationDate } from '../../src/lib/taskCreation';
import { useCreateTask, type ScheduleConflict } from '../../src/query/useTasks';
import { useSession } from '../../src/store/session';
import {
  ANDROID_LABEL_GAP,
  ANDROID_LABEL_ICON,
  androidChip,
  androidChipScroll,
  androidField,
  androidLabel,
  androidLabelRow,
  isAndroid,
  useTheme,
} from '../../src/theme';

/**
 * Port of `TaskEditor`'s `creationForm` (ios/App/RootView.swift:1932-2050).
 *
 * FIELD SET, which is much smaller than the brief describes: Swift's creation form has exactly four
 * inputs — task name, notes, project and date — plus a duration stepper. There is no priority, no
 * energy, no tags, no recurrence, no dependencies and no reminder offset on this screen; several of
 * those live on `TaskDetailsView` instead, and tags and dependencies do not exist in `NexdoTask` at
 * all. See the Phase 3 status section of the migration plan.
 */
export default function NewTask() {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);
  const zone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);
  // Which input has focus, for the Android field's accent border (docs/android-polish.md §3).
  const [focused, setFocused] = useState<'title' | 'notes' | null>(null);
  const [duration, setDuration] = useState(30);
  const [dateChoice, setDateChoice] = useState<TaskCreationDate>('Today');
  // `TaskEditor.initialProjectID` (RootView.swift:1912, 1978): the project detail's "Add task"
  // opens the editor with that project already chosen.
  const { projectId: initialProjectID } = useLocalSearchParams<{ projectId?: string }>();
  const [projectID, setProjectID] = useState<string | null>(initialProjectID ?? null);
  // `@State private var customDate = Date()` and `showingDatePicker` (RootView.swift:1919-1921).
  const [customDate, setCustomDate] = useState(() => Date.now());
  const [showingDatePicker, setShowingDatePicker] = useState(false);
  // `@State private var dateExplicitlyChosen = false` (RootView.swift:1921).
  const [dateExplicitlyChosen, setDateExplicitlyChosen] = useState(false);
  // `DeterministicTaskActionDetector().detect(title:)` runs on every keystroke in `body` (`:1983`).
  const [detectorNow] = useState(() => Date.now());
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);

  /**
   * `resolvedCreationDate` (RootView.swift:2086-2089).
   *
   * A time detected in the TITLE wins — but only until a date pill is tapped. After that the pills
   * decide, even if the title still says "at 4 PM".
   */
  const detected = detectTaskAction(title, detectorNow, zone);
  const resolvedCreationDate =
    !dateExplicitlyChosen && detected?.scheduledAt != null
      ? detected.scheduledAt
      : creationDateFor(dateChoice, zone, customDate);

  const create = useCreateTask({ onConflict: setConflict });
  const busy = create.isPending;
  // `canSave` (RootView.swift:2078-2080)
  const canSave = !busy && title.trim().length > 0;

  if (conflict) {
    const pending = conflict;
    setConflict(null);
    Alert.alert('Review this time', pending.warnings.join('\n\n'), [
      { text: 'Keep previous schedule', style: 'cancel', onPress: pending.cancel },
      { text: 'Save anyway', onPress: pending.confirm },
    ]);
  }

  const save = () => {
    if (!canSave) return;
    create.mutate(
      {
        title: title.trim(),
        notes,
        durationMin: duration,
        startAt: new Date(resolvedCreationDate).toISOString(),
        projectId: projectID,
      },
      {
        onSuccess: () => router.back(),
        onError: (error) => {
          // `perform(errorMessage:)` (NexdoApp.swift:496).
          if (error.name === 'ScheduleConflictCancelled') return;
          Alert.alert('Couldn’t update your task. Refresh to check its current state before retrying.', error.message);
        },
      },
    );
  };

  const android = isAndroid();
  const notesPreview = notes.length === 0 ? 'Add a note (optional)' : notes;
  const notesInput = (
    <TextInput
      accessibilityLabel="Task notes"
      placeholder="Add context, links, or a definition of done…"
      placeholderTextColor={theme.colors.secondary}
      value={notes}
      onChangeText={setNotes}
      onFocus={() => setFocused('notes')}
      onBlur={() => setFocused(null)}
      multiline
      style={[
        styles.input,
        styles.notesInput,
        { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator },
        androidField(theme, focused === 'notes', { raised: true }),
      ]}
      testID="task-notes"
    />
  );

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
          <LabeledField title="TASK NAME" icon="checklist">
            <TextInput
              accessibilityLabel="Task name"
              placeholder="What needs to get done?"
              placeholderTextColor={theme.colors.secondary}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setFocused('title')}
              onBlur={() => setFocused(null)}
              multiline
              style={[
                styles.input,
                styles.titleInput,
                { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator },
                androidField(theme, focused === 'title', { raised: true }),
              ]}
              testID="task-title"
            />
          </LabeledField>

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />

          {/* `DisclosureGroup` (RootView.swift:1953-1976). Android (docs/android-polish.md §4): the NOTES
              label sits above a field like every other label, and the collapsed preview IS that
              field — a lighter, outlined row that reads as tappable. Both expand the notes, as the
              disclosure does; the label row collapses them again. */}
          {android ? (
            <View style={styles.androidField}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notes"
                accessibilityState={{ expanded: notesExpanded }}
                onPress={() => setNotesExpanded((value) => !value)}
                hitSlop={12}
                style={styles.androidNotesHeader}
                testID="notes-disclosure"
              >
                <EditorLabel title="NOTES" icon="text.alignleft" />
                <View style={styles.grow} />
                {notesExpanded ? <TaskSymbol name="chevron.down" size={15} color={theme.colors.secondary} /> : null}
              </Pressable>
              {notesExpanded ? (
                notesInput
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={notesPreview}
                  accessibilityState={{ expanded: false }}
                  onPress={() => setNotesExpanded(true)}
                  style={[androidField(theme, false, { raised: true }), styles.androidNotesField]}
                  testID="notes-preview"
                >
                  <Text numberOfLines={1} style={[styles.notesPreview, styles.grow, { color: theme.colors.secondary }]}>
                    {notesPreview}
                  </Text>
                  <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} />
                </Pressable>
              )}
            </View>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notes"
                accessibilityState={{ expanded: notesExpanded }}
                onPress={() => setNotesExpanded((value) => !value)}
                style={styles.disclosure}
                testID="notes-disclosure"
              >
                <View style={styles.disclosureLabel}>
                  <EditorLabel title="NOTES" icon="text.alignleft" />
                  {!notesExpanded ? (
                    <Text numberOfLines={1} style={[styles.notesPreview, { color: theme.colors.secondary }]}>
                      {notesPreview}
                    </Text>
                  ) : null}
                </View>
                {/* A `DisclosureGroup` chevron, which rotates in place. Notes expand HERE; they do not
                    navigate to a notes screen, so the collapsed glyph must not imply a push. */}
                <TaskSymbol name={notesExpanded ? 'chevron.down' : 'chevron.right'} size={15} color={theme.colors.secondary} />
              </Pressable>
              {notesExpanded ? notesInput : null}
            </>
          )}

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <LabeledField title="PROJECT" icon="folder">
            <ProjectAssignmentField projectID={projectID} onChange={setProjectID} raised />
          </LabeledField>

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <LabeledField title="DATE" icon="calendar">
            <ChoiceRow testID="date-choices">
              {TASK_CREATION_DATES.map((choice) => (
                <ChoiceButton
                  key={choice}
                  // RootView.swift:2060 — once chosen, the custom button shows the date instead of its title.
                  label={choice === 'Select Date' && dateChoice === 'Select Date' ? customDateLabel(customDate, zone) : choice}
                  selected={dateChoice === choice}
                  onPress={() => {
                    setDateChoice(choice);
                    // `dateExplicitlyChosen = true` (RootView.swift:2061): from here on, a time in the
                    // title no longer overrides the pills.
                    setDateExplicitlyChosen(true);
                    if (choice === 'Select Date') setShowingDatePicker(true);
                  }}
                  testID={`date-${choice}`}
                />
              ))}
            </ChoiceRow>
          </LabeledField>

          {/* `if let detected = DeterministicTaskActionDetector().detect(title:)` (RootView.swift:1983-1986). */}
          {detected ? (
            <Text style={[styles.caption, { color: theme.colors.secondary }]} testID="new-task-action-hint">
              {`Nexdo Action: contact ${detected.contactName}. Schedule: ${creationDateLabel(resolvedCreationDate, zone)}.`}
            </Text>
          ) : null}

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <LabeledField title="TIME ESTIMATE" icon="clock">
            <ChoiceRow testID="duration-choices">
              {[15, 30, 45, 60].map((minutes) => (
                <ChoiceButton
                  key={minutes}
                  label={`${minutes}m`}
                  selected={duration === minutes}
                  onPress={() => setDuration(minutes)}
                  testID={`duration-${minutes}`}
                />
              ))}
            </ChoiceRow>
          </LabeledField>

          {/* `Stepper(value: $duration, in: 5...480, step: 5)` (RootView.swift:2000-2008) */}
          <View style={[styles.stepper, { backgroundColor: theme.colors.groupedBackground }, androidField(theme, false, { raised: true, padded: false })]} testID="duration-stepper">
            <View style={styles.stepperText}>
              <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Custom estimate</Text>
              <Text style={[theme.typography.body, styles.stepperValue, { color: theme.colors.ink }]}>{duration} min</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease estimate"
              onPress={() => setDuration((value) => Math.max(5, value - 5))}
              style={styles.stepperButton}
              testID="duration-decrease"
            >
              <Text style={[styles.stepperGlyph, { color: theme.colors.link }]}>−</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase estimate"
              onPress={() => setDuration((value) => Math.min(480, value + 5))}
              style={styles.stepperButton}
              testID="duration-increase"
            >
              <Text style={[styles.stepperGlyph, { color: theme.colors.link }]}>+</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* `.sheet(isPresented: $showingDatePicker)` (RootView.swift:2038-2049): a graphical date
          picker titled "Select Date" with a Done confirmation button, over the account time zone. */}
      <Modal visible={showingDatePicker} animationType="slide" transparent onRequestClose={() => setShowingDatePicker(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.sheetBar}>
              <Text accessibilityRole="header" style={[styles.sheetTitle, { color: theme.colors.ink }]}>
                Select Date
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={() => setShowingDatePicker(false)}
                style={styles.sheetDone}
                testID="date-picker-done"
              >
                <Text style={[theme.typography.body, { color: theme.colors.link }]}>Done</Text>
              </Pressable>
            </View>
            <MonthCalendar selected={customDate} onSelect={setCustomDate} timeZone={zone} />
          </View>
        </View>
      </Modal>

      {/* `.safeAreaInset(edge: .bottom)` (RootView.swift:2013-2028) */}
      <StickyFooter background={theme.colors.surface}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Creating…' : 'Create Task'}
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={save}
          testID="create-task"
        >
          {canSave ? (
            <LinearGradient colors={SELECTED_GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.saveButton}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={[styles.saveLabel, { color: '#FFFFFF' }]}>{busy ? 'Creating…' : 'Create Task'}</Text>
              {!busy ? <TaskSymbol name="arrow.right" size={17} color="#FFFFFF" /> : null}
            </LinearGradient>
          ) : (
            <View style={[styles.saveButton, { backgroundColor: theme.colors.groupedBackground }]}>
              <Text style={[styles.saveLabel, { color: theme.colors.secondary }]}>Create Task</Text>
              {/* `if !model.busy { Image(systemName: "arrow.right") }` (RootView.swift:2017) — the
                  arrow tracks the *busy* state, not whether the button is enabled. */}
              <TaskSymbol name="arrow.right" size={17} color={theme.colors.secondary} />
            </View>
          )}
        </Pressable>
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

/** `.formatted(date: .abbreviated, time: .shortened)` on the resolved creation date (RootView.swift:1984). */
function creationDateLabel(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}

/** `customDateLabel` (RootView.swift:2071-2076): `MMM d, yyyy` in the account zone. */
function customDateLabel(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at));
}

type EditorIcon = 'checklist' | 'text.alignleft' | 'folder' | 'calendar' | 'clock';

/**
 * `TaskEditorLabel` (RootView.swift:2207-2217). Android draws the one shared field label instead
 * (`androidLabel`, docs/android-polish.md §4): the tint read as dim on the dark card.
 */
function EditorLabel({ title, icon }: { title: string; icon: EditorIcon }) {
  const theme = useTheme();
  const android = isAndroid();
  return (
    <View style={[styles.editorLabel, android && androidLabelRow]}>
      <TaskSymbol name={icon} size={android ? ANDROID_LABEL_ICON : 13} color={android ? theme.colors.fieldLabel : theme.colors.tint} />
      <Text style={[styles.editorLabelText, { color: theme.colors.link }, androidLabel(theme)]}>{title}</Text>
    </View>
  );
}

/**
 * A label and its field. On iOS the pair sits the card's 20 apart, exactly as when they were
 * siblings; on Android the label is 8 above its field.
 */
function LabeledField({ title, icon, children }: { title: string; icon: EditorIcon; children: React.ReactNode }) {
  return (
    <View style={isAndroid() ? styles.androidField : styles.labeledField}>
      <EditorLabel title={title} icon={icon} />
      {children}
    </View>
  );
}

/** Android: the card's 20 is cancelled so the chips scroll to its edges. */
const CHIP_SCROLL = androidChipScroll(20);

/** The DATE and TIME ESTIMATE rows: equal-width buttons on iOS, a horizontal chip row on Android. */
function ChoiceRow({ children, testID }: { children: React.ReactNode; testID: string }) {
  if (!isAndroid()) return <View style={styles.choiceRow}>{children}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={CHIP_SCROLL.style}
      contentContainerStyle={CHIP_SCROLL.contentContainerStyle}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

/** `TaskDurationButtonStyle` (RootView.swift:2218-2230), used by both the date and duration rows. */
function ChoiceButton({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      // Android: a chip as wide as its label, not an equal share of the row.
      style={isAndroid() ? null : styles.choiceWrapper}
    >
      {selected ? (
        <LinearGradient
          colors={SELECTED_GRADIENT}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          // Android: the field radius, so selected and unselected choices share a shape.
          style={[styles.choice, isAndroid() && styles.androidChoice, isAndroid() && androidChip]}
          testID={testID ? `${testID}-surface` : undefined}
        >
          <Text numberOfLines={isAndroid() ? 1 : undefined} style={[styles.choiceLabel, { color: '#FFFFFF' }]}>
            {label}
          </Text>
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.choice,
            { backgroundColor: theme.colors.groupedBackground, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.separator },
            androidField(theme, false, { raised: true, padded: false }),
            isAndroid() && androidChip,
          ]}
          testID={testID ? `${testID}-surface` : undefined}
        >
          <Text numberOfLines={isAndroid() ? 1 : undefined} style={[styles.choiceLabel, { color: theme.colors.ink }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** `TaskCreationStyle.selectedGradient` (RootView.swift:2199-2203). */
const SELECTED_GRADIENT = ['#91198A', '#5930BF', '#144DAD'] as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  caption: { fontSize: 12, lineHeight: 16 },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  card: { gap: 20, padding: 20, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth },
  editorLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  editorLabelText: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8 },
  input: { padding: 16, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  titleInput: { fontSize: 20, lineHeight: 25, fontWeight: '600', minHeight: 56 },
  notesInput: { fontSize: 17, lineHeight: 22, minHeight: 96, textAlignVertical: 'top' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.45 },
  disclosure: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  disclosureLabel: { flex: 1, gap: 6 },
  notesPreview: { fontSize: 15, lineHeight: 20 },
  choiceRow: { flexDirection: 'row', gap: 9 },
  // The card's own gap: a label and its field are 20 apart on iOS, as siblings were.
  labeledField: { gap: 20 },
  androidField: { gap: ANDROID_LABEL_GAP },
  androidNotesHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  androidNotesField: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  choiceWrapper: { flex: 1 },
  choice: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 6 },
  androidChoice: { borderRadius: 12 },
  choiceLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 15, borderRadius: 15 },
  stepperText: { flex: 1, gap: 4 },
  stepperValue: { fontWeight: '600' },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperGlyph: { fontSize: 24, lineHeight: 28, fontWeight: '600' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { padding: 20, gap: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  sheetDone: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, borderRadius: 17 },
  saveLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
});
