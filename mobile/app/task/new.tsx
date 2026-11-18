import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoidingView, KeyboardAwareScrollView, NexdoTaskBackdrop, StickyFooter, TaskSymbol, Text } from '../../src/components';
import { MonthCalendar } from '../../src/components/MonthCalendar';
import { ProjectAssignmentField } from '../../src/components/ProjectAssignmentField';
import { withAlpha } from '../../src/components/SignInBackdrop';
import { resolvedCreationDate as resolvedStart } from '../../src/features/tasks/creationSpacing';
import { useAccessibilityTextSize } from '../../src/features/wellness/useAccessibilityTextSize';
import { detectTaskAction } from '../../src/lib/taskActionDetector';
import { creationDateFor, TASK_CREATION_DATES, type TaskCreationDate } from '../../src/lib/taskCreation';
import { useCreateTask, useTasks, type ScheduleConflict } from '../../src/query/useTasks';
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
 * Port of `TaskEditor`'s `creationForm` (ios/App/RootView.swift:2262-2344; 9e82c95 for the header, the notes row,
 * the Custom estimate sheet and the Create Task bar).
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
  // 9e82c95: the Custom estimate sheet (`showingCustomEstimate`, :2242) and the scroll viewport's height, which
  // sets the card's spacing (`GeometryReader { viewport in … }`, :2265-2266).
  const [showingCustomEstimate, setShowingCustomEstimate] = useState(false);
  const [viewport, setViewport] = useState<number | null>(null);
  const spacing = viewport === null ? 20 : Math.min(23, Math.max(14, 14 + (viewport - 520) / 14));
  const insets = useSafeAreaInsets();
  const large = useAccessibilityTextSize();
  const accent = theme.scheme === 'dark' ? CREATION_ACCENT.dark : CREATION_ACCENT.light;

  /**
   * `resolvedCreationDate` (RootView.swift:2297-2302).
   *
   * A time detected in the TITLE wins — but only until a date pill is tapped. After that the pills
   * decide, even if the title still says "at 4 PM". d568989: the pill's time then moves to the first
   * opening with 15 minutes either side of the open, scheduled tasks (`TaskCreationSpacing`); this
   * screen only ever creates, so it always applies.
   */
  const detected = detectTaskAction(title, detectorNow, zone);
  const existingTasks = useTasks().data?.tasks;
  const resolvedCreationDate = resolvedStart({
    detectedAt: detected?.scheduledAt ?? null,
    dateExplicitlyChosen,
    proposed: creationDateFor(dateChoice, zone, customDate),
    creating: true,
    durationMin: duration,
    tasks: existingTasks ?? [],
  });

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
      {/* `creationHeader` (RootView.swift:2346-2359) on `.ultraThinMaterial`: Close, the heading, the microphone.
          At accessibility sizes the heading sits above the two controls. */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: withAlpha(theme.colors.surface, 0.85) }]} testID="task-editor-header">
        {large ? null : (
          <View pointerEvents="none" style={[styles.headingOverlay, { top: insets.top + 8 }]}>
            <Heading />
          </View>
        )}
        {large ? <Heading /> : null}
        <View style={styles.headerControls}>
          {/* `Button("Close")` (:2363-2369): a capsule in the accent, on the card fill with a hairline. */}
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => router.back()}
            style={[styles.closeCapsule, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }, busy && styles.voiceDisabled]}
            testID="task-editor-close"
          >
            <Text style={[styles.closeLabel, { color: accent }]}>Close</Text>
          </Pressable>
          <View style={styles.grow} />
          <TaskEditorVoiceButton disabled={busy} projectId={projectID} />
        </View>
      </View>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.scroll}
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
        testID="task-editor-scroll"
      >
        <View
          style={[styles.card, { gap: spacing, paddingBottom: spacing + 4, backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}
          testID="task-editor-card"
        >
          <LabeledField title="TASK NAME" icon="list.bullet" gap={spacing}>
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
          <LabeledField title="FOLDER" icon="folder" gap={spacing}>
            <ProjectAssignmentField projectID={projectID} onChange={setProjectID} raised />
          </LabeledField>

          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <LabeledField title="DATE" icon="calendar" gap={spacing}>
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
          {/* `estimateSection` (RootView.swift:2424-2462): the label with a trailing Custom button, then the presets. */}
          <View style={isAndroid() ? styles.androidField : { gap: 8 }}>
            <View style={styles.estimateHeader}>
              <EditorLabel title="TIME ESTIMATE" icon="clock" />
              <View style={styles.grow} />
              <Pressable
                accessibilityLabel="Custom estimate"
                accessibilityRole="button"
                accessibilityValue={{ text: `${duration} minutes` }}
                hitSlop={8}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowingCustomEstimate(true);
                }}
                style={styles.customButton}
                testID="duration-custom"
              >
                <Text style={[styles.customLabel, { color: accent }]}>{COMMON_DURATIONS.includes(duration) ? 'Custom' : `${duration}m`}</Text>
              </Pressable>
            </View>
            <ChoiceRow testID="duration-choices">
              {COMMON_DURATIONS.map((minutes) => (
                <ChoiceButton
                  key={minutes}
                  label={`${minutes}m`}
                  accessibilityLabel={`${minutes} minutes`}
                  selected={duration === minutes}
                  onPress={() => setDuration(minutes)}
                  testID={`duration-${minutes}`}
                />
              ))}
            </ChoiceRow>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* `.sheet(isPresented: $showingCustomEstimate)` (:2448-2461): "Custom estimate", a 5–480 stepper in 5s, Done. */}
      <Modal visible={showingCustomEstimate} animationType="slide" transparent onRequestClose={() => setShowingCustomEstimate(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]} testID="custom-estimate-sheet">
            <View style={styles.sheetBar}>
              <Text accessibilityRole="header" style={[styles.sheetTitle, { color: theme.colors.ink }]}>
                Custom estimate
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={() => setShowingCustomEstimate(false)}
                style={styles.sheetDone}
                testID="custom-estimate-done"
              >
                <Text style={[theme.typography.body, styles.stepperValue, { color: theme.colors.link }]}>Done</Text>
              </Pressable>
            </View>
            <View style={[styles.stepper, { backgroundColor: theme.colors.groupedBackground }, androidField(theme, false, { raised: true, padded: false })]} testID="duration-stepper">
              <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{`${duration} minutes`}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease estimate"
                accessibilityState={{ disabled: duration <= 5 }}
                disabled={duration <= 5}
                onPress={() => setDuration((value) => Math.max(5, value - 5))}
                style={styles.stepperButton}
                testID="duration-decrease"
              >
                <Text style={[styles.stepperGlyph, { color: theme.colors.link }]}>−</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase estimate"
                accessibilityState={{ disabled: duration >= 480 }}
                disabled={duration >= 480}
                onPress={() => setDuration((value) => Math.min(480, value + 5))}
                style={styles.stepperButton}
                testID="duration-increase"
              >
                <Text style={[styles.stepperGlyph, { color: theme.colors.link }]}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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

      {/* `.safeAreaInset(edge: .bottom)` (RootView.swift:2307-2324): 9e82c95 keeps Create Task on `actionGradient`
          with white bold text, at 0.88 while it cannot save, 0.85 while pressed. The arrow tracks the busy state. */}
      <StickyFooter background={theme.colors.surface}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Creating…' : 'Create Task'}
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={save}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
          testID="create-task"
        >
          <LinearGradient
            colors={ACTION_GRADIENT}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.saveButton, { opacity: canSave ? 1 : 0.88 }]}
            testID="create-task-gradient"
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={[styles.saveLabel, { color: '#FFFFFF' }]}>{busy ? 'Creating…' : 'Create Task'}</Text>
            {!busy ? (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <TaskSymbol name="arrow.right" size={17} color="#FFFFFF" />
              </View>
            ) : null}
          </LinearGradient>
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

type EditorIcon = 'checklist' | 'list.bullet' | 'text.alignleft' | 'folder' | 'calendar' | 'clock';

/** `commonDurations` (RootView.swift:2252). */
const COMMON_DURATIONS = [15, 30, 45, 60];

/** `TaskCreationStyle.accent` (RootView.swift:2617-2621). */
const CREATION_ACCENT = { light: '#3D29C7', dark: '#B8ADFF' };

/** `TaskCreationStyle.actionGradient` (:2622-2625), top to bottom. */
const ACTION_GRADIENT = ['#572BF2', '#3D24C4'] as const;

/** `TaskCreationStyle.voiceGradient` (:2626-2630), top-leading to bottom-trailing. */
const VOICE_GRADIENT = ['#874DF2', '#4D2BD9', '#215CE6'] as const;


/** `Text("Create New Task").font(.title3.bold()).accessibilityAddTraits(.isHeader)` (:2347-2349). */
function Heading() {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" numberOfLines={2} style={[styles.heading, { color: theme.colors.ink }]} testID="task-editor-heading">
      Create New Task
    </Text>
  );
}

/**
 * `TaskEditorLabel` (RootView.swift:2207-2217). Android draws the one shared field label instead
 * (`androidLabel`, docs/android-polish.md §4): the tint read as dim on the dark card.
 */
/**
 * `ToolbarItem(placement: .topBarTrailing)` `mic.fill` (RootView.swift:2353-2362): drop focus and open a fresh
 * Add by Voice over the editor. Each press pushes a new voice screen, which is Swift's new `voicePresentationID`
 * — a new session every time. Disabled while the task is being created. 08a64da: the session saves into the folder
 * chosen in the form right now (`AddTaskByVoiceView(projectID: projectID)`, RootView.swift:2333).
 */
export function TaskEditorVoiceButton({ disabled, projectId = null }: { disabled: boolean; projectId?: string | null }) {
  const theme = useTheme();
  const accent = theme.scheme === 'dark' ? CREATION_ACCENT.dark : CREATION_ACCENT.light;
  // 9e82c95 (:2371-2386): a white mic on a 44-point `voiceGradient` disc inside two accent halos (16%, 8%).
  return (
    <Pressable
      accessibilityLabel="Add task by voice"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        Keyboard.dismiss();
        router.push(projectId ? { pathname: '/task/voice-capture', params: { projectId } } : '/task/voice-capture');
      }}
      style={[styles.voiceButton, disabled && styles.voiceDisabled]}
      testID="task-editor-voice"
    >
      <View style={[styles.halo, { padding: 4, backgroundColor: withAlpha(accent, 0.08) }]}>
        <View style={[styles.halo, { padding: 5, backgroundColor: withAlpha(accent, 0.16) }]}>
          <LinearGradient colors={VOICE_GRADIENT} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.voiceDisc} testID="task-editor-voice-gradient">
            <TaskSymbol color="#FFFFFF" name="mic.fill" size={22} />
          </LinearGradient>
        </View>
      </View>
    </Pressable>
  );
}

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
function LabeledField({ title, icon, gap = 20, children }: { title: string; icon: EditorIcon; gap?: number; children: React.ReactNode }) {
  return (
    <View style={isAndroid() ? styles.androidField : { gap }}>
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
function ChoiceButton({ label, accessibilityLabel, selected, onPress, testID }: { label: string; accessibilityLabel?: string; selected: boolean; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
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
  voiceButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  voiceDisabled: { opacity: 0.4 },
  halo: { borderRadius: 999 },
  voiceDisc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // `creationHeader`: `.padding(.horizontal, 16).padding(.vertical, 8)`; the heading inset 76 from each side.
  header: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  headingOverlay: { position: 'absolute', left: 16 + 76, right: 16 + 76, bottom: 8, justifyContent: 'center', alignItems: 'center' },
  headerControls: { flexDirection: 'row', alignItems: 'center' },
  heading: { fontSize: 20, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
  closeCapsule: { minHeight: 44, paddingHorizontal: 15, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  closeLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  estimateHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  customButton: { minHeight: 44, justifyContent: 'center' },
  customLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  fill: { flex: 1 },
  caption: { fontSize: 12, lineHeight: 16 },
  // `.padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)` around the card (:2301).
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  // `.padding(.horizontal, 18).padding(.top, 18)`, `RoundedRectangle(cornerRadius: 24)` (:2298-2300); the gap and
  // bottom padding follow the viewport.
  card: { paddingHorizontal: 18, paddingTop: 18, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  editorLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  editorLabelText: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8 },
  // 9e82c95: 12 × 10 inside a 14-radius field (:2276-2280); Android's field padding wins (§3).
  input: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  titleInput: { fontSize: 20, lineHeight: 25, fontWeight: '600', minHeight: 44 },
  notesInput: { fontSize: 17, lineHeight: 22, minHeight: 96, padding: 12, textAlignVertical: 'top' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.45 },
  disclosure: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  disclosureLabel: { flex: 1, gap: 6 },
  notesPreview: { fontSize: 15, lineHeight: 20 },
  choiceRow: { flexDirection: 'row', gap: 9 },
  androidField: { gap: ANDROID_LABEL_GAP },
  androidNotesHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  androidNotesField: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  choiceWrapper: { flex: 1 },
  choice: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 6 },
  androidChoice: { borderRadius: 12 },
  choiceLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 15, borderRadius: 15 },
  stepperValue: { fontWeight: '600' },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperGlyph: { fontSize: 24, lineHeight: 28, fontWeight: '600' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { padding: 20, gap: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  sheetDone: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  // `.frame(maxWidth: .infinity, minHeight: 50).padding(.vertical, 2)` in a 17-radius shape (:2316-2318).
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 50, paddingVertical: 2, borderRadius: 17 },
  saveLabel: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
});
