import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { NexdoTaskBackdrop, TaskSymbol, Text, withTaskAlpha } from '../../src/components';
import { detailsBody, draftFrom, draftsEqual, isDraftValid, scheduleBody, type TaskDraft } from '../../src/lib/taskDraft';
import { taskSubtitle } from '../../src/lib/taskLabels';
import { isDone } from '../../src/lib/taskQuery';
import { useCompleteTask, useDeleteTask, useTask, useUpdateTask, type ScheduleConflict } from '../../src/query/useTasks';
import { canStartFocusSession, canStartTask, FOCUS_SESSION_MINUTES, useFocus } from '../../src/store/focus';
import { useSession } from '../../src/store/session';
import { useTheme } from '../../src/theme';

/**
 * Port of `TaskDetailsView` (ios/App/TaskDetailsView.swift).
 *
 * In Swift this is not a route of its own: `TaskEditor(task:)` renders `TaskDetailsView` when the task
 * is non-nil (RootView.swift:1929-1931) and `TasksView` presents it as a sheet. Expo Router needs a
 * path, so it is `/task/[id]` presented as a modal — same presentation, addressable differently.
 *
 * The `actions` section (TaskDetailsView.swift:114-127) renders its two buttons with Swift's copy,
 * placement and enabled rules, but is wired to `src/store/focus.ts`, a STUB that records the intent
 * and no-ops. TODO(phase4): swap that store for the real focus runtime; the buttons then post to the
 * server and `FocusSessionStrip` replaces the first button while a session is live.
 */
export default function TaskDetail() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useSession((state) => state.profile);
  const task = useTask(id);

  const original = useMemo(() => (task ? draftFrom(task) : null), [task]);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [newStep, setNewStep] = useState('');
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);

  const focus = useFocus();
  const update = useUpdateTask({ onConflict: setConflict });
  const complete = useCompleteTask({ onConflict: setConflict });
  const remove = useDeleteTask();

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
      <View style={[styles.fill, styles.centre, { backgroundColor: theme.colors.groupedBackground }]}>
        <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>This task is no longer in your list.</Text>
      </View>
    );
  }

  // The buffer is seeded from the cached task and then owned by the screen, so a background refetch
  // does not overwrite what is being typed.
  const current = draft ?? original;
  const set = (next: Partial<TaskDraft>) => setDraft({ ...current, ...next });

  const zone = profile?.timeZone ?? task.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const busy = update.isPending || complete.isPending || remove.isPending;
  const dirty = !draftsEqual(current, original) || newStep.trim().length > 0;
  const canSave = dirty && isDraftValid(current) && !busy;

  const save = () => {
    if (!canSave) return;
    // An unsent step in the field is part of the edit, as `dirty` implies.
    const steps = newStep.trim().length > 0
      ? [...current.steps, { id: `new-${current.steps.length}`, title: newStep.trim(), sortOrder: current.steps.length }]
      : current.steps;
    const pending: TaskDraft = { ...current, steps };

    update.mutate(
      { id: task.id, details: detailsBody(pending, original), schedule: scheduleBody(pending, original) },
      {
        onSuccess: () => {
          setNewStep('');
          setDraft(null);
          router.back();
        },
        onError: (error) => {
          if (error.name === 'ScheduleConflictCancelled' || error.name === 'StaleWriteDiscarded') return;
          Alert.alert('Couldn’t update your task. Refresh to check its current state before retrying.', error.message);
        },
      },
    );
  };

  const confirmDelete = () => {
    Alert.alert('Delete this task?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate(task.id, { onSuccess: () => router.back() }),
      },
    ]);
  };

  return (
    <View style={styles.fill}>
      <NexdoTaskBackdrop />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.scroll}>
        <Card>
          <TextInput
            accessibilityLabel="Task title"
            value={current.title}
            onChangeText={(title) => set({ title })}
            style={[styles.titleInput, { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator }]}
            testID="detail-title"
          />
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>{taskSubtitle(task, zone)}</Text>

          <ToggleRow
            label="Critical"
            value={current.critical}
            onChange={(critical) => set({ critical })}
            testID="detail-critical"
          />

          <TextInput
            accessibilityLabel="Task notes"
            placeholder="Context, links, or anything you need to remember..."
            placeholderTextColor={theme.colors.secondary}
            value={current.notes}
            onChangeText={(notes) => set({ notes })}
            multiline
            style={[styles.notesInput, { color: theme.colors.ink, backgroundColor: theme.colors.groupedBackground, borderColor: theme.colors.separator }]}
            testID="detail-notes"
          />
        </Card>

        {/* `actions` (TaskDetailsView.swift:114-127), above the metadata, as in Swift. */}
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Start a ${FOCUS_SESSION_MINUTES}-minute focus session`}
            accessibilityState={{ disabled: !canStartFocusSession(task.status, isDone(task)) }}
            disabled={!canStartFocusSession(task.status, isDone(task))}
            onPress={() => focus.startFocus(task.id)}
            testID="detail-start-focus"
            style={[
              styles.outlineButton,
              { backgroundColor: theme.colors.background, borderColor: withTaskAlpha(theme.colors.tint, 0.16) },
            ]}
          >
            <Text
              style={[
                styles.outlineLabel,
                { color: canStartFocusSession(task.status, isDone(task)) ? theme.colors.ink : theme.colors.secondary },
              ]}
            >
              {`Start a ${FOCUS_SESSION_MINUTES}-minute focus session`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={task.status === 'IN_PROGRESS' ? 'Task in progress' : 'Start task'}
            accessibilityState={{ disabled: !canStartTask(task.status, isDone(task)) }}
            disabled={!canStartTask(task.status, isDone(task))}
            onPress={() => focus.startTask(task.id)}
            testID="detail-start-task"
            style={[
              styles.outlineButton,
              { backgroundColor: theme.colors.background, borderColor: withTaskAlpha(theme.colors.tint, 0.16) },
            ]}
          >
            <Text
              style={[
                styles.outlineLabel,
                { color: canStartTask(task.status, isDone(task)) ? theme.colors.ink : theme.colors.secondary },
              ]}
            >
              {task.status === 'IN_PROGRESS' ? 'Task in progress' : 'Start task'}
            </Text>
          </Pressable>
        </Card>

        <Card title="PRIORITY">
          <OptionRow
            options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
            value={current.priority}
            onChange={(priority) => set({ priority })}
            prefix="priority"
          />
        </Card>

        <Card title="ENERGY">
          <OptionRow options={['LOW', 'MEDIUM', 'HIGH']} value={current.energy} onChange={(energy) => set({ energy })} prefix="energy" />
        </Card>

        <Card title="TIME ESTIMATE">
          <View style={styles.row}>
            <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{current.duration} min</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Less"
              onPress={() => set({ duration: Math.max(1, current.duration - 5) })}
              style={styles.stepperButton}
              testID="detail-duration-less"
            >
              <Text style={[styles.stepperGlyph, { color: theme.colors.tint }]}>−</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              onPress={() => set({ duration: Math.min(1440, current.duration + 5) })}
              style={styles.stepperButton}
              testID="detail-duration-more"
            >
              <Text style={[styles.stepperGlyph, { color: theme.colors.tint }]}>+</Text>
            </Pressable>
          </View>
        </Card>

        <Card title="REPEATS">
          <OptionRow
            options={['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']}
            value={current.recurrence}
            onChange={(recurrence) => set({ recurrence })}
            prefix="recurrence"
          />
        </Card>

        {/* `steps` (TaskDetailsView.swift:178-200) */}
        <Card title="STEPS">
          {current.steps.map((step, index) => (
            <View key={step.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${step.completedAt ? 'Reopen' : 'Complete'} ${step.title}`}
                onPress={() => {
                  const steps = [...current.steps];
                  steps[index] = { ...step, completedAt: step.completedAt ? null : new Date().toISOString() };
                  set({ steps });
                }}
                style={styles.stepToggle}
                testID={`step-toggle-${step.id}`}
              >
                <TaskSymbol
                  name={step.completedAt ? 'checkmark.circle.fill' : 'circle'}
                  size={22}
                  color={step.completedAt ? theme.colors.tint : theme.colors.secondary}
                />
              </Pressable>
              <TextInput
                accessibilityLabel={`Step ${index + 1}`}
                value={step.title}
                onChangeText={(title) => {
                  const steps = [...current.steps];
                  steps[index] = { ...step, title };
                  set({ steps });
                }}
                style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}
                testID={`step-title-${step.id}`}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${step.title}`}
                onPress={() => set({ steps: current.steps.filter((item) => item.id !== step.id) })}
                style={styles.stepToggle}
                testID={`step-remove-${step.id}`}
              >
                <TaskSymbol name="xmark.circle.fill" size={20} color={theme.colors.secondary} />
              </Pressable>
            </View>
          ))}
          <View style={styles.row}>
            <TextInput
              accessibilityLabel="Add a step"
              placeholder="Add a step"
              placeholderTextColor={theme.colors.secondary}
              value={newStep}
              onChangeText={setNewStep}
              style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}
              testID="new-step"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add"
              disabled={newStep.trim().length === 0}
              onPress={() => {
                set({ steps: [...current.steps, { id: `new-${Date.now()}`, title: newStep.trim(), sortOrder: current.steps.length }] });
                setNewStep('');
              }}
              style={styles.addStep}
              testID="add-step"
            >
              <Text style={[theme.typography.body, { color: newStep.trim().length === 0 ? theme.colors.secondary : theme.colors.tint }]}>Add</Text>
            </Pressable>
          </View>
        </Card>

        {/* `footer` (TaskDetailsView.swift:204-220) */}
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDone(task) ? 'Mark incomplete' : 'Mark complete'}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => complete.mutate(task)}
            style={styles.footerButton}
            testID="detail-complete"
          >
            <Text style={[theme.typography.body, { color: theme.colors.tint }]}>{isDone(task) ? 'Mark incomplete' : 'Mark complete'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete task"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={confirmDelete}
            style={styles.footerButton}
            testID="detail-delete"
          >
            <Text style={[theme.typography.body, { color: theme.colors.danger }]}>Delete task</Text>
          </Pressable>
        </Card>
      </ScrollView>

      <View style={[styles.saveBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.separator }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={update.isPending ? 'Saving…' : 'Save changes'}
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={save}
          style={[styles.saveButton, { backgroundColor: canSave ? theme.colors.tint : theme.colors.groupedBackground }]}
          testID="detail-save"
        >
          <Text style={[styles.saveLabel, { color: canSave ? '#FFFFFF' : theme.colors.secondary }]}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.cardWrapper}>
      {title ? <Text style={[styles.cardTitle, { color: theme.colors.tint }]}>{title}</Text> : null}
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>{children}</View>
    </View>
  );
}

function ToggleRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (next: boolean) => void; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} testID={testID} />
    </View>
  );
}

function OptionRow({
  options,
  value,
  onChange,
  prefix,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  prefix: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.options}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={option.charAt(0) + option.slice(1).toLowerCase()}
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            testID={`${prefix}-${option}`}
            style={[
              styles.option,
              { borderColor: theme.colors.separator, backgroundColor: selected ? theme.colors.tint : theme.colors.groupedBackground },
            ]}
          >
            <Text style={[styles.optionLabel, { color: selected ? '#FFFFFF' : theme.colors.ink }]}>
              {option.charAt(0) + option.slice(1).toLowerCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 20, gap: 18, paddingBottom: 24 },
  cardWrapper: { gap: 6 },
  cardTitle: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8, marginLeft: 4 },
  card: { gap: 12, padding: 16, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  titleInput: { fontSize: 20, lineHeight: 25, fontWeight: '600', padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  notesInput: { fontSize: 17, lineHeight: 22, minHeight: 88, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, textAlignVertical: 'top' },
  caption: { fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  grow: { flex: 1 },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperGlyph: { fontSize: 24, lineHeight: 28, fontWeight: '600' },
  stepToggle: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  addStep: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  optionLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  outlineButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth },
  outlineLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  footerButton: { minHeight: 44, justifyContent: 'center' },
  saveBar: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  saveButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  saveLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
});
