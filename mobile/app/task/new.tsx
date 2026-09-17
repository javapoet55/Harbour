import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { NexdoTaskBackdrop, StickyFooter, TaskSymbol, Text } from '../../src/components';
import { MonthCalendar } from '../../src/components/MonthCalendar';
import { ProjectAssignmentField } from '../../src/components/ProjectAssignmentField';
import { detectTaskAction } from '../../src/lib/taskActionDetector';
import { creationDateFor, TASK_CREATION_DATES, type TaskCreationDate } from '../../src/lib/taskCreation';
import { useCreateTask, type ScheduleConflict } from '../../src/query/useTasks';
import { useSession } from '../../src/store/session';
import { useTheme } from '../../src/theme';

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

  return (
    <View style={styles.fill}>
      <NexdoTaskBackdrop />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
          <EditorLabel title="TASK NAME" icon="checklist" />
          <TextInput
            accessibilityLabel="Task name"
            placeholder="What needs to get done?"
            placeholderTextColor={theme.colors.secondary}
            value={title}
            onChangeText={setTitle}
            multiline
            style={[styles.input, styles.titleInput, { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator }]}
            testID="task-title"
          />

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />

          {/* `DisclosureGroup` (RootView.swift:1953-1976) */}
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
                  {notes.length === 0 ? 'Add a note (optional)' : notes}
                </Text>
              ) : null}
            </View>
            {/* A `DisclosureGroup` chevron, which rotates in place. Notes expand HERE; they do not
                navigate to a notes screen, so the collapsed glyph must not imply a push. */}
            <TaskSymbol name={notesExpanded ? 'chevron.down' : 'chevron.right'} size={15} color={theme.colors.secondary} />
          </Pressable>
          {notesExpanded ? (
            <TextInput
              accessibilityLabel="Task notes"
              placeholder="Add context, links, or a definition of done…"
              placeholderTextColor={theme.colors.secondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[styles.input, styles.notesInput, { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator }]}
              testID="task-notes"
            />
          ) : null}

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <EditorLabel title="PROJECT" icon="folder" />
          <ProjectAssignmentField projectID={projectID} onChange={setProjectID} />

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <EditorLabel title="DATE" icon="calendar" />
          <View style={styles.choiceRow}>
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
          </View>

          {/* `if let detected = DeterministicTaskActionDetector().detect(title:)` (RootView.swift:1983-1986). */}
          {detected ? (
            <Text style={[styles.caption, { color: theme.colors.secondary }]} testID="new-task-action-hint">
              {`Nexdo Action: contact ${detected.contactName}. Schedule: ${creationDateLabel(resolvedCreationDate, zone)}.`}
            </Text>
          ) : null}

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <EditorLabel title="TIME ESTIMATE" icon="clock" />
          <View style={styles.choiceRow}>
            {[15, 30, 45, 60].map((minutes) => (
              <ChoiceButton
                key={minutes}
                label={`${minutes}m`}
                selected={duration === minutes}
                onPress={() => setDuration(minutes)}
                testID={`duration-${minutes}`}
              />
            ))}
          </View>

          {/* `Stepper(value: $duration, in: 5...480, step: 5)` (RootView.swift:2000-2008) */}
          <View style={[styles.stepper, { backgroundColor: theme.colors.groupedBackground }]}>
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
              <Text style={[styles.stepperGlyph, { color: theme.colors.tint }]}>−</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase estimate"
              onPress={() => setDuration((value) => Math.min(480, value + 5))}
              style={styles.stepperButton}
              testID="duration-increase"
            >
              <Text style={[styles.stepperGlyph, { color: theme.colors.tint }]}>+</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

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
                <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Done</Text>
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
    </View>
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

/** `TaskEditorLabel` (RootView.swift:2207-2217). */
function EditorLabel({ title, icon }: { title: string; icon: 'checklist' | 'text.alignleft' | 'folder' | 'calendar' | 'clock' }) {
  const theme = useTheme();
  return (
    <View style={styles.editorLabel}>
      <TaskSymbol name={icon} size={13} color={theme.colors.tint} />
      <Text style={[styles.editorLabelText, { color: theme.colors.tint }]}>{title}</Text>
    </View>
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
      style={styles.choiceWrapper}
    >
      {selected ? (
        <LinearGradient colors={SELECTED_GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.choice}>
          <Text style={[styles.choiceLabel, { color: '#FFFFFF' }]}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.choice, { backgroundColor: theme.colors.groupedBackground, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.separator }]}>
          <Text style={[styles.choiceLabel, { color: theme.colors.ink }]}>{label}</Text>
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
  choiceWrapper: { flex: 1 },
  choice: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 6 },
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
