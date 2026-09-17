import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NexdoLogoMark, TaskSymbol, Text } from '../../src/components';
import { useCoordinator } from '../../src/actions/coordinator';
import { ClarifyTaskActionCard } from '../../src/components/ClarifyTaskActionCard';
import { TaskActionCard } from '../../src/components/TaskActionCard';
import { MonthCalendar } from '../../src/components/MonthCalendar';
import { ProjectAssignmentField } from '../../src/components/ProjectAssignmentField';
import {
  DetailCheckbox,
  DetailField,
  DetailMenu,
  DetailOutlineButton,
  DetailTextInput,
  detailInputStyle,
  SectionLabel,
  withAlpha,
} from '../../src/components/TaskDetailParts';
import { detailsBody, draftFrom, draftsEqual, isDraftValid, scheduleBody, type TaskDraft } from '../../src/lib/taskDraft';
import { dayKey, isDone, startOfDay } from '../../src/lib/taskQuery';
import {
  useCompleteTask,
  useSaveClarifiedStep,
  useStartTask,
  useTask,
  useUpdateTask,
  type ScheduleConflict,
} from '../../src/query/useTasks';
import { canStartFocusSession, canStartTask, FOCUS_SESSION_MINUTES, useFocus } from '../../src/store/focus';
import { FocusSessionStrip } from '../../src/components/FocusSessionStrip';
import { useSession } from '../../src/store/session';
import { brand, useTheme } from '../../src/theme';

/**
 * Port of `TaskDetailsView` (ios/App/TaskDetailsView.swift), rebuilt element by element from the view
 * body at `:28-90`.
 *
 * In Swift this is not a route: `TaskEditor(task:)` renders it when the task is non-nil
 * (RootView.swift:1929) and `TasksView` presents that as a sheet. Expo Router needs a path, so it is
 * `/task/[id]` as a modal.
 *
 * Order, matching `body` exactly: header, `TaskActionCard`, `actions`, TASK, `metadata`
 * (PRIORITY + ESTIMATE side by side), PROJECT, `schedule`, REPEAT, the "Important reminders"
 * checkbox, STEPS, NOTES, then the `footer` bar.
 */
export default function TaskDetail() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useSession((state) => state.profile);
  const task = useTask(id);
  const contactAction = useCoordinator((state) => state.actions.find((item) => item.taskId === id));

  const original = useMemo(() => (task ? draftFrom(task) : null), [task]);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [newStep, setNewStep] = useState('');
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);
  const [picking, setPicking] = useState<'date' | 'time' | null>(null);
  const [clarifyFailure, setClarifyFailure] = useState<string | null>(null);

  const focusSession = useFocus((state) => state.session);
  const startFocus = useFocus((state) => state.startFocus);
  const focusBusy = useFocus((state) => state.busy);
  const startTask = useStartTask({ onConflict: setConflict });
  const update = useUpdateTask({ onConflict: setConflict });
  const complete = useCompleteTask({ onConflict: setConflict });
  const clarify = useSaveClarifiedStep({ onConflict: setConflict });

  // `confirmScheduleWarnings` (NexdoApp.swift:87-98).
  if (conflict) {
    const pending = conflict;
    setConflict(null);
    Alert.alert('Review this time', pending.warnings.join('\n\n'), [
      { text: 'Keep previous schedule', style: 'cancel', onPress: pending.cancel },
      { text: 'Save anyway', onPress: pending.confirm },
    ]);
  }

  if (!task || !original) {
    return (
      <View style={[styles.fill, styles.centre, { backgroundColor: theme.colors.background }]}>
        <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>This task is no longer in your list.</Text>
      </View>
    );
  }

  const current = draft ?? original;
  const set = (next: Partial<TaskDraft>) => setDraft({ ...current, ...next });

  const zone = profile?.timeZone ?? task.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // `if let action = coordinator.action(for: task.id) … else if … ClarifyTaskActionCard`
  // (TaskActionView.swift:10, `:36`): the two branches are mutually exclusive.
  const hasContactAction = contactAction !== undefined;
  // `blocked` (TaskDetailsView.swift:25)
  const blocked = update.isPending || complete.isPending || clarify.isPending || startTask.isPending || focusBusy;
  // `dirty` (TaskDetailsView.swift:26)
  const dirty = !draftsEqual(current, original) || newStep.trim().length > 0;
  const valid = isDraftValid(current);

  /** `addStep` (TaskDetailsView.swift:236-241). */
  const addStep = (from: TaskDraft = current): TaskDraft => {
    const value = newStep.trim();
    if (value.length === 0 || from.steps.length >= 50) return from;
    return {
      ...from,
      steps: [...from.steps, { id: `new-${from.steps.length}-${value}`, title: value, completedAt: null, sortOrder: from.steps.length }],
    };
  };

  /** `persist()` (TaskDetailsView.swift:243-248): flush the pending step, then send both bodies. */
  const persist = (after?: () => void) => {
    const pending = addStep();
    update.mutate(
      { id: task.id, details: detailsBody(pending, original), schedule: scheduleBody(pending, original) },
      {
        onSuccess: () => {
          setNewStep('');
          setDraft(null);
          if (after) after();
          else router.back();
        },
        onError: (error) => {
          if (error.name === 'ScheduleConflictCancelled' || error.name === 'StaleWriteDiscarded') return;
          // `run(_:)`'s catch (TaskDetailsView.swift:256).
          Alert.alert('Task details', 'Couldn’t update your task. Your edits are still here. Please try again.');
        },
      },
    );
  };

  /** `footer`'s Mark complete (TaskDetailsView.swift:205-214): save the buffer first, then flip. */
  const markComplete = () => {
    const flip = () => complete.mutate(task, { onSuccess: () => router.back() });
    if (dirty) persist(flip);
    else flip();
  };

  const scheduleAt = current.schedule;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {/* `header` (TaskDetailsView.swift:94-112) */}
      <View style={[styles.header, { borderBottomColor: withAlpha(brand.nexdoIndigo, 0.1) }]}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: theme.colors.tint }]}>TASK DETAILS</Text>
          <Text accessibilityRole="header" numberOfLines={2} style={[styles.headerTitle, { color: theme.colors.ink }]}>
            {current.title.trim().length === 0 ? task.title : current.title}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close task details"
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={() => router.back()}
          testID="detail-close"
          style={[styles.close, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.09) }]}
        >
          <TaskSymbol name="xmark" size={17} color={theme.colors.tint} />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.scroll}>
        {/* `TaskActionCard(task:)` (TaskDetailsView.swift:34). Its FIRST branch — a scheduled contact
            action — wins; the clarify card below is the fall-through (TaskActionView.swift:10, `:36`). */}
        <TaskActionCard task={task} onOpen={(id) => useCoordinator.getState().open(id)} />
        {hasContactAction ? null : (
        <ClarifyTaskActionCard
          task={task}
          saving={clarify.isPending}
          failure={clarifyFailure}
          onSaveNextStep={(title) => {
            setClarifyFailure(null);
            clarify.mutate(
              { id: task.id, title },
              { onError: () => setClarifyFailure('Couldn’t save your next step. Please try again.') },
            );
          }}
          onSaveContactAction={(title) => {
            setClarifyFailure(null);
            // Swift calls `model.saveTask(id:title:notes:duration:)`; the same PATCH, title only.
            update.mutate(
              { id: task.id, details: { title }, schedule: null },
              {
                onError: () => setClarifyFailure('Couldn’t update this task. Please try again.'),
                /**
                 * The "Contact someone" follow-through (TaskActionView.swift:90-93): once the title
                 * is saved, the coordinator reconciles it into an action and OPENS that action.
                 * This closed the Phase 3 follow-through marker.
                 */
                onSuccess: (saved) => {
                  const owner = profile?.id;
                  if (!owner || !saved) return;
                  void useCoordinator
                    .getState()
                    .synchronize([saved], owner, zone)
                    .then(() => {
                      const created = useCoordinator.getState().actionForTask(saved.id);
                      if (created) useCoordinator.getState().open(created.id);
                    });
                },
              },
            );
          }}
        />
        )}

        {/* `actions` (TaskDetailsView.swift:114-127) */}
        <View style={styles.actions}>
          {/* While a session for THIS task is live, the strip takes the focus button's place. */}
          {focusSession?.taskId === task.id ? (
            <FocusSessionStrip />
          ) : (
            <DetailOutlineButton
              title={`Start a ${FOCUS_SESSION_MINUTES}-minute focus session`}
              disabled={blocked || !canStartFocusSession(task.status, isDone(task))}
              onPress={() => {
                void startFocus(task).catch((cause: unknown) => {
                  Alert.alert('Focus session', cause instanceof Error ? cause.message : 'Please try again.');
                });
              }}
              testID="detail-start-focus"
            />
          )}
          <DetailOutlineButton
            title={task.status === 'IN_PROGRESS' ? 'Task in progress' : 'Start task'}
            disabled={blocked || !canStartTask(task.status, isDone(task))}
            onPress={() => startTask.mutate(task)}
            testID="detail-start-task"
          />
        </View>

        <DetailField title="TASK">
          <DetailTextInput
            value={current.title}
            onChangeText={(title) => set({ title })}
            accessibilityLabel="Task title"
            testID="detail-title"
          />
        </DetailField>

        {/* `metadata` (TaskDetailsView.swift:129-148): PRIORITY and ESTIMATE side by side. */}
        <View style={styles.metadata}>
          <DetailField title="PRIORITY">
            <DetailMenu
              label="Priority"
              accessibilityLabel="Priority"
              value={current.priority}
              options={['LOW', 'NORMAL', 'HIGH', 'CRITICAL']}
              display={capitalised}
              onSelect={(priority) => set({ priority })}
              testID="detail-priority"
            />
          </DetailField>
          <DetailField title="ESTIMATE">
            <DetailMenu
              label="Estimate"
              accessibilityLabel="Estimate"
              value={String(current.duration)}
              options={['15', '30', '45', '60', '90', '120'].sort(byNumber)}
              display={(minutes) => `${minutes} min`}
              onSelect={(minutes) => set({ duration: Number(minutes) })}
              testID="detail-estimate"
            >
              {/* `ControlGroup { Less / More }` (TaskDetailsView.swift:139-142) */}
              <View style={[styles.controlGroup, { borderTopColor: theme.colors.separator }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Less"
                  onPress={() => set({ duration: Math.max(1, current.duration - 5) })}
                  testID="detail-estimate-less"
                  style={styles.controlButton}
                >
                  <Text style={[theme.typography.body, { color: theme.colors.tint }]}>− Less</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More"
                  onPress={() => set({ duration: Math.min(1440, current.duration + 5) })}
                  testID="detail-estimate-more"
                  style={styles.controlButton}
                >
                  <Text style={[theme.typography.body, { color: theme.colors.tint }]}>+ More</Text>
                </Pressable>
              </View>
            </DetailMenu>
          </DetailField>
        </View>

        <DetailField title="PROJECT">
          <ProjectAssignmentField projectID={current.projectId} onChange={(projectId) => set({ projectId })} />
        </DetailField>

        {/* `schedule` (TaskDetailsView.swift:150-171) */}
        <View style={[styles.scheduleCard, { backgroundColor: theme.colors.background, borderColor: withAlpha(brand.nexdoIndigo, 0.16) }]}>
          <SectionLabel title="SCHEDULE" />
          {scheduleAt !== null ? (
            <View style={styles.scheduleRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Schedule date"
                accessibilityValue={{ text: dateLabel(scheduleAt, zone) }}
                onPress={() => setPicking('date')}
                testID="detail-schedule-date"
                style={[detailInputStyle(theme), styles.chip]}
              >
                <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{dateLabel(scheduleAt, zone)}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start time"
                accessibilityValue={{ text: timeLabel(scheduleAt, zone) }}
                onPress={() => setPicking('time')}
                testID="detail-schedule-time"
                style={[detailInputStyle(theme), styles.chip]}
              >
                <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{timeLabel(scheduleAt, zone)}</Text>
              </Pressable>
            </View>
          ) : (
            <DetailOutlineButton
              title="Set date and start time"
              onPress={() => set({ schedule: Date.now() })}
              testID="detail-set-schedule"
            />
          )}
        </View>

        <DetailField title="REPEAT">
          <DetailMenu
            label="Repeat"
            accessibilityLabel="Repeat"
            value={current.recurrence}
            options={['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']}
            display={(option) => (option === 'NONE' ? 'Does not repeat' : capitalised(option))}
            onSelect={(recurrence) => set({ recurrence })}
            testID="detail-repeat"
          />
        </DetailField>

        {/* The critical toggle (TaskDetailsView.swift:48-54) */}
        <DetailCheckbox
          title="Important reminders"
          subtitle="Use escalation channels"
          value={current.critical}
          onChange={(critical) => set({ critical })}
          testID="detail-critical"
        />

        {/* `steps` (TaskDetailsView.swift:178-200) */}
        <DetailField title="STEPS">
          <View style={styles.steps}>
            {current.steps.map((step) => (
              <View key={step.id} style={[detailInputStyle(theme), styles.stepRow]}>
                <TaskSymbol
                  name={step.completedAt === null || step.completedAt === undefined ? 'circle' : 'checkmark.circle.fill'}
                  size={20}
                  color={theme.colors.secondary}
                />
                <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{step.title}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove step ${step.title}`}
                  onPress={() => set({ steps: current.steps.filter((item) => item.id !== step.id) })}
                  testID={`detail-step-remove-${step.id}`}
                  style={styles.stepRemove}
                >
                  <TaskSymbol name="xmark" size={15} color={theme.colors.secondary} />
                </Pressable>
              </View>
            ))}
            <View style={styles.addStepRow}>
              <View style={styles.grow}>
                <DetailTextInput
                  value={newStep}
                  onChangeText={setNewStep}
                  placeholder="Add a step"
                  accessibilityLabel="Add task step"
                  testID="detail-new-step"
                />
              </View>
              <DetailOutlineButton
                title="Add"
                disabled={newStep.trim().length === 0 || current.steps.length >= 50}
                onPress={() => {
                  setDraft(addStep());
                  setNewStep('');
                }}
                testID="detail-add-step"
              />
            </View>
            {current.steps.length >= 50 ? (
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>Up to 50 steps per task.</Text>
            ) : null}
          </View>
        </DetailField>

        <DetailField title="NOTES">
          <DetailTextInput
            value={current.notes}
            onChangeText={(notes) => set({ notes })}
            placeholder="Context, links, or anything you need to remember..."
            accessibilityLabel="Task notes"
            multiline
            testID="detail-notes"
          />
        </DetailField>
      </ScrollView>

      {/* `footer` (TaskDetailsView.swift:203-227): Mark complete and Save changes, side by side. */}
      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: withAlpha(brand.nexdoIndigo, 0.1), paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.footerButton}>
          <DetailOutlineButton
            title={isDone(task) ? 'Mark incomplete' : 'Mark complete'}
            accessibilityLabel={isDone(task) ? 'Mark task incomplete' : 'Mark task complete'}
            greenBackground
            disabled={blocked || !valid}
            onPress={markComplete}
            testID="detail-complete"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save task changes"
          accessibilityState={{ disabled: blocked || !valid || !dirty }}
          disabled={blocked || !valid || !dirty}
          onPress={() => persist()}
          testID="detail-save"
          style={[styles.footerButton, !(valid && dirty) && styles.dimmed]}
        >
          <View style={[styles.saveCapsule, { backgroundColor: theme.colors.tint }]}>
            {update.isPending ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={[styles.saveLabel, { color: '#FFFFFF' }]}>{update.isPending ? 'Saving…' : 'Save changes'}</Text>
          </View>
        </Pressable>
      </View>

      {/* The two `.datePickerStyle(.compact)` pickers (TaskDetailsView.swift:156-163). */}
      <Modal visible={picking !== null} animationType="slide" transparent onRequestClose={() => setPicking(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.sheetBar}>
              <Text accessibilityRole="header" style={[styles.sheetTitle, { color: theme.colors.ink }]}>
                {picking === 'time' ? 'Start time' : 'Schedule date'}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => setPicking(null)} style={styles.sheetDone} testID="detail-schedule-done">
                <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Done</Text>
              </Pressable>
            </View>
            {/* Both chips only exist once `schedule` is set, so there is never a null to fall back from. */}
            {picking === 'date' && scheduleAt !== null ? (
              <MonthCalendar selected={scheduleAt} onSelect={(next) => set({ schedule: next })} timeZone={zone} />
            ) : null}
            {picking === 'time' && scheduleAt !== null ? (
              <TimeGrid selected={scheduleAt} onSelect={(next) => set({ schedule: next })} timeZone={zone} />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * The hour-and-minute half of the schedule. SwiftUI's compact `DatePicker` opens a wheel; this is a
 * list of half-hour slots, for the same reason `MonthCalendar` is hand-built — see its note.
 */
function TimeGrid({ selected, onSelect, timeZone }: { selected: number; onSelect: (next: number) => void; timeZone: string }) {
  const theme = useTheme();
  const midnight = startOfDay(selected, timeZone);
  const currentSlot = Math.floor((selected - midnight) / 1_800_000);

  return (
    <ScrollView style={styles.timeGrid}>
      {Array.from({ length: 48 }, (_, slot) => {
        const at = midnight + slot * 1_800_000;
        const label = timeLabel(at, timeZone);
        const isSelected = slot === currentSlot;
        return (
          <Pressable
            key={slot}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(at)}
            testID={`time-slot-${slot}`}
            style={styles.timeRow}
          >
            <Text style={[theme.typography.body, { color: isSelected ? theme.colors.tint : theme.colors.ink }]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** `.capitalized` on an all-caps enum value: "NORMAL" reads as "Normal". */
function capitalised(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function byNumber(left: string, right: string): number {
  return Number(left) - Number(right);
}

function dateLabel(at: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at));
  } catch {
    return dayKey(at, timeZone);
  }
}

function timeLabel(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

export { NexdoLogoMark };

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  // `.padding(.horizontal, 20).padding(.vertical, 18)` with a bottom divider.
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { flex: 1, gap: 5 },
  // `.font(.caption.weight(.bold)).tracking(1.7)`
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.7 },
  // `.font(.title3.weight(.semibold))`
  headerTitle: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // `.padding(20)` with `VStack(spacing: 24)`.
  scroll: { padding: 20, gap: 24 },
  actions: { gap: 8 },
  metadata: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  controlGroup: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  controlButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // `.padding(12)`, corner radius 17.
  scheduleCard: { gap: 8, padding: 12, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth },
  scheduleRow: { flexDirection: 'row', gap: 12 },
  chip: { flex: 1, justifyContent: 'center' },
  steps: { gap: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepRemove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  caption: { fontSize: 12, lineHeight: 16 },
  // `.padding(.horizontal, 16).padding(.vertical, 12)` over `.regularMaterial`, divider on top.
  // paddingBottom is added at render from the safe-area inset: on gesture-nav Android this bar
  // otherwise sits under the navigation controls. See StickyFooter for the shared version.
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerButton: { flex: 1 },
  dimmed: { opacity: 0.55 },
  saveCapsule: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, paddingHorizontal: 12, borderRadius: 999 },
  saveLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { padding: 20, gap: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  sheetDone: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  timeGrid: { maxHeight: 320 },
  timeRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
