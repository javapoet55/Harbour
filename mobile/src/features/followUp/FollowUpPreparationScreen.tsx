import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { followUpApi } from '../../api/followUp';
import type { NexdoTask } from '../../api/types';
import { Text } from '../../components/Text';
import { IOSSwitch } from '../../components/IOSSwitch';
import type { TaskActionRecipient } from '../../lib/actionNeeded';
import { notificationDate, type StoredTaskAction } from '../../lib/taskAction';
import { isDone, parseServerDate } from '../../lib/taskQuery';
import { queryKeys } from '../../query/keys';
import { useSaveFollowUp, type FollowUpThen } from '../../query/useFollowUp';
import type { ScheduleConflict } from '../../query/useTasks';
import { useSession } from '../../store/session';
import { inputText, textStyles, useTheme } from '../../theme';
import { DateField, FormField, FormRow, FormScroll, FormSection, FormText, MenuPicker } from '../moments/form';
import {
  canAddCheck,
  canSavePreparation,
  followUpDraft,
  makePreparation,
  outcomeLabel,
  preparationAfterLoad,
  recordOutcome,
  type FollowUpPreparation,
  type FollowUpResult,
} from './model';

/**
 * `FollowUpPreparationView` (ios/App/FollowUpPreparationView.swift, 6f079c0): "One saved preparation is
 * reused from the task, Today, and its notification." A sheet over the Nexdo Action screen, or over
 * Task Details for a completed follow-up (its outcome history). The data layer is §32's
 * (`followUp.ts`, `useSaveFollowUp`); this is the `Form`.
 */

const RESULTS: { value: FollowUpResult; title: string }[] = [
  { value: 'unresolved', title: 'Unresolved / waiting for response' },
  { value: 'noAnswer', title: 'No answer' },
  { value: 'resolved', title: 'Resolved' },
];

const HOUR = 3_600_000;

export function FollowUpPreparationScreen({
  task,
  action,
  initialContact,
  zone,
  onSaved,
  onClose,
  now = Date.now,
}: {
  task: NexdoTask;
  action: StoredTaskAction;
  initialContact?: TaskActionRecipient | null;
  zone: string;
  /** `saved: (FollowUpPreparation) -> Void`: the action keeps the preparation on the device too. */
  onSaved: (preparation: FollowUpPreparation) => void;
  onClose: () => void;
  now?: () => number;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const owner = useSession((state) => state.profile?.id) ?? '';
  const scheduled = notificationDate(action);
  const done = isDone(task);
  const [value, setValue] = useState<FollowUpPreparation>(
    () => action.preparation ?? makePreparation({ company: action.contactName, purpose: action.context ?? '', notes: task.notes ?? '' }, randomUUID),
  );
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<FollowUpResult>('unresolved');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [recordedId, setRecordedId] = useState<string | null>(null);
  // `max(action.notificationDate ?? Date(), Date().addingTimeInterval(3600))` (:27).
  const [nextAt, setNextAt] = useState(() => Math.max(scheduled ?? now(), now() + HOUR));
  // On when there is no reminder yet and the task is open (:25).
  const [useSchedule, setUseSchedule] = useState(() => scheduled === null && !done);
  const [newCheck, setNewCheck] = useState('');
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);
  const save = useSaveFollowUp({ onConflict: setConflict, now });
  const busy = save.isPending;
  const attempt = useRef(0);

  if (conflict) {
    const pending = conflict;
    setConflict(null);
    Alert.alert('Review this time', pending.warnings.join('\n\n'), [
      { text: 'Keep previous schedule', style: 'cancel', onPress: pending.cancel },
      { text: 'Save anyway', onPress: pending.confirm },
    ]);
  }

  /** `load()` (:101-108). A saved preparation wins; else the chosen contact fills company, phone and email. */
  const load = () => {
    const run = ++attempt.current;
    setLoading(true);
    setError(null);
    queryClient
      .fetchQuery({ queryKey: queryKeys.followUp(owner, task.id), queryFn: () => followUpApi.load(task.id), staleTime: 0 })
      .then((envelope) => {
        if (run !== attempt.current) return;
        setRevision(envelope.revision);
        setValue((current) => preparationAfterLoad(envelope, current, initialContact ?? action.manualRecipient));
        setLoading(false);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (run !== attempt.current) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });
  };
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    // `.task { await load() }`: after the sheet is on screen.
    const timer = setTimeout(() => loadRef.current(), 0);
    return () => clearTimeout(timer);
  }, []);

  // `.interactiveDismissDisabled(busy)`: Android's back closes only when Close would.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) onClose();
      return true;
    });
    return () => subscription.remove();
  }, [busy, onClose]);

  // `canSave` (:100).
  const canSave = loaded && !loading && !busy && canSavePreparation(value);

  /** `save(then:)` (:110-128): the outcome is appended once, so a retry does not add another. */
  const submit = async (then: FollowUpThen) => {
    setError(null);
    let preparation = value;
    if (then !== null && recordedId === null) {
      const recorded = recordOutcome(value, recordedId, { result: outcome, notes: outcomeNotes }, now(), randomUUID);
      preparation = recorded.preparation;
      setValue(preparation);
      setRecordedId(recorded.recordedId);
    }
    try {
      const saved = await save.mutateAsync({ task, revision, preparation, then, reschedule: useSchedule, nextAt });
      setRevision(saved.revision);
      onSaved(preparation);
      onClose();
    } catch (cause) {
      // The preparation may have saved before completing or rescheduling failed: keep its new revision.
      const cached = queryClient.getQueryData<{ revision: number }>(queryKeys.followUp(owner, task.id));
      if (cached && cached.revision > revision) {
        setRevision(cached.revision);
        onSaved(preparation);
      }
      if (cause instanceof Error && cause.name === 'ScheduleConflictCancelled') return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const disabled = busy || loading;
  const set = (patch: Partial<FollowUpPreparation>) => setValue((current) => ({ ...current, ...patch }));

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]} testID="follow-up-preparation">
      {/* `.navigationTitle("Follow-up preparation")`, inline, with Close (disabled while busy). */}
      <View style={styles.bar}>
        <View style={styles.side} />
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: theme.colors.label }]}>
          Follow-up preparation
        </Text>
        <Pressable accessibilityRole="button" disabled={busy} hitSlop={8} onPress={onClose} style={[styles.side, styles.trailing, { opacity: busy ? 0.4 : 1 }]} testID="follow-up-close">
          <Text style={[textStyles.body, { color: theme.colors.ink }]}>Close</Text>
        </Pressable>
      </View>
      {/* collapsable={false}: never flattened, so turning pointerEvents to 'none' does not create a view and move the keyboard-aware scroll view into it — Fabric's addViewAt crash on Android (android-polish.md §39). */}
      <View collapsable={false} pointerEvents={disabled ? 'none' : 'auto'} style={styles.fill}>
        <FormScroll testID="follow-up-form">
          {loading ? (
            <FormSection>
              <FormRow last>
                <View style={styles.inline} testID="follow-up-loading">
                  <ActivityIndicator color={theme.colors.secondaryLabel} />
                  <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]}>Loading preparation…</Text>
                </View>
              </FormRow>
            </FormSection>
          ) : null}

          <FormSection header="Follow-up">
            <FormRow>
              <FormField onChangeText={(company) => set({ company })} placeholder="Company or contact" testID="follow-up-company" value={value.company} />
            </FormRow>
            <FormRow>
              <FormField multiline onChangeText={(purpose) => set({ purpose })} placeholder="What do you need to follow up about?" testID="follow-up-purpose" value={value.purpose} />
            </FormRow>
            <FormRow>
              <FormField keyboardType="phone-pad" onChangeText={(phone) => set({ phone })} placeholder="Phone (optional)" testID="follow-up-phone" value={value.phone} />
            </FormRow>
            <FormRow>
              <FormField autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onChangeText={(email) => set({ email })} placeholder="Email (optional)" testID="follow-up-email" value={value.email} />
            </FormRow>
            {scheduled !== null ? (
              <FormRow>
                <View style={styles.inline}>
                  <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>Scheduled</Text>
                  <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]} testID="follow-up-scheduled">
                    {formatDateTime(scheduled, zone)}
                  </Text>
                </View>
              </FormRow>
            ) : null}
            <FormRow last={!useSchedule}>
              <ToggleRow label="Set or change follow-up time" onValueChange={setUseSchedule} testID="follow-up-use-schedule" value={useSchedule} />
            </FormRow>
            {useSchedule ? (
              <FormRow last>
                <DateField includeTime label="Follow-up time" minimum={now()} onChange={setNextAt} testID="follow-up-time" value={nextAt} zone={zone} />
              </FormRow>
            ) : null}
          </FormSection>

          <FormSection header="Preparation notes">
            <FormRow last>
              {/* `.lineLimit(3...8)`: three lines tall when empty (`follow-up-preparation-saved`). */}
              <TextInput
                accessibilityLabel="Reference numbers, previous discussion and questions"
                multiline
                onChangeText={(notes) => set({ notes })}
                placeholder="Reference numbers, previous discussion and questions"
                placeholderTextColor={theme.colors.placeholder}
                style={[inputText(textStyles.body), styles.notes, { color: theme.colors.label }]}
                testID="follow-up-notes"
                textAlignVertical="top"
                value={value.notes}
              />
            </FormRow>
          </FormSection>

          <FormSection header="Checklist">
            {value.checklist.map((check, index) => (
              <FormRow key={check.id}>
                <View style={styles.inline}>
                  <StepTitleInput
                    onChangeText={(title) => set({ checklist: value.checklist.map((item) => (item.id === check.id ? { ...item, title } : item)) })}
                    testID={`follow-up-check-${index}`}
                    value={check.title}
                  />
                  {/* `.onDelete` is a swipe on iOS; Android shows the delete. */}
                  <Pressable accessibilityLabel={`Delete ${check.title}`} accessibilityRole="button" hitSlop={8} onPress={() => set({ checklist: value.checklist.filter((item) => item.id !== check.id) })} testID={`follow-up-check-delete-${index}`}>
                    <Ionicons color={theme.colors.danger} name="remove-circle-outline" size={20} />
                  </Pressable>
                  <IOSSwitch
                    accessibilityLabel={check.title || 'Preparation step'}
                    onValueChange={(on) => set({ checklist: value.checklist.map((item) => (item.id === check.id ? { ...item, done: on } : item)) })}
                    testID={`follow-up-check-done-${index}`}
                    value={check.done}
                  />
                </View>
              </FormRow>
            ))}
            <FormRow last>
              <View style={styles.inline}>
                <TextInput
                  accessibilityLabel="Add a preparation step"
                  onChangeText={setNewCheck}
                  placeholder="Add a preparation step"
                  placeholderTextColor={theme.colors.placeholder}
                  style={[inputText(textStyles.body), styles.grow, { color: theme.colors.label }]}
                  testID="follow-up-new-check"
                  value={newCheck}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canAddCheck(value, newCheck) }}
                  disabled={!canAddCheck(value, newCheck)}
                  onPress={() => {
                    set({ checklist: [...value.checklist, { id: randomUUID(), title: newCheck, done: false }] });
                    setNewCheck('');
                  }}
                  testID="follow-up-add-check"
                >
                  <Text style={[textStyles.body, { color: canAddCheck(value, newCheck) ? theme.colors.ink : tertiaryLabel(theme.scheme) }]}>Add</Text>
                </Pressable>
              </View>
            </FormRow>
          </FormSection>

          <FormSection header="Editable message draft">
            <FormRow>
              <TextInput
                accessibilityLabel="Message draft"
                multiline
                onChangeText={(draft) => set({ draft })}
                style={[inputText(textStyles.body), styles.draft, { color: theme.colors.label }]}
                testID="follow-up-draft"
                textAlignVertical="top"
                value={value.draft}
              />
            </FormRow>
            <FormRow>
              <LinkRow onPress={() => set({ draft: followUpDraft(value.purpose) })} testID="follow-up-create-draft" title="Create draft from purpose" />
            </FormRow>
            <FormRow last>
              <FormText caption tone="secondary">
                Save this preparation to your NexDo account. Call and email remain under your control.
              </FormText>
            </FormRow>
          </FormSection>

          <FormSection>
            <FormRow last>
              <LinkRow disabled={!canSave} onPress={() => void submit(null)} testID="follow-up-save" title="Save preparation" />
            </FormRow>
          </FormSection>

          {!done ? (
            <FormSection header="Record outcome">
              <FormRow>
                <MenuPicker disabled={recordedId !== null} label="Result" onChange={setOutcome} options={RESULTS} testID="follow-up-result" value={outcome} />
              </FormRow>
              <FormRow>
                <FormField
                  editable={recordedId === null}
                  multiline
                  onChangeText={setOutcomeNotes}
                  placeholder="What happened? What is the next step?"
                  testID="follow-up-outcome-notes"
                  value={outcomeNotes}
                />
              </FormRow>
              {outcome !== 'resolved' ? (
                <>
                  <FormRow>
                    <DateField includeTime label="Next follow-up" minimum={now()} onChange={setNextAt} testID="follow-up-next" value={nextAt} zone={zone} />
                  </FormRow>
                  <FormRow last>
                    <LinkRow disabled={!canSave} onPress={() => void submit('schedule')} testID="follow-up-record-schedule" title="Record and schedule next follow-up" />
                  </FormRow>
                </>
              ) : (
                <FormRow last>
                  <LinkRow disabled={!canSave} onPress={() => void submit('complete')} testID="follow-up-record-complete" title="Record and complete task" />
                </FormRow>
              )}
            </FormSection>
          ) : null}

          {value.outcomes.length > 0 ? (
            <FormSection header="Outcome history" testID="follow-up-history">
              {[...value.outcomes].reverse().map((item, index, all) => (
                <FormRow key={item.id} last={index === all.length - 1}>
                  <View style={styles.historyItem}>
                    <Text style={[textStyles.body, styles.bold, { color: theme.colors.label }]}>{outcomeLabel(item.result)}</Text>
                    {parseServerDate(item.date) !== null ? (
                      <Text style={[styles.caption, { color: theme.colors.label }]}>{formatDateTime(parseServerDate(item.date)!, zone)}</Text>
                    ) : null}
                    <Text style={[textStyles.body, { color: theme.colors.label }]}>{item.notes}</Text>
                  </View>
                </FormRow>
              ))}
            </FormSection>
          ) : null}

          {error !== null ? (
            <FormSection>
              <FormRow last={loaded}>
                <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="follow-up-error">
                  {error}
                </Text>
              </FormRow>
              {!loaded ? (
                <FormRow last>
                  <LinkRow onPress={load} testID="follow-up-retry" title="Retry loading" />
                </FormRow>
              ) : null}
            </FormSection>
          ) : null}
        </FormScroll>
      </View>
    </SafeAreaView>
  );
}

/** `date.formatted(date: .abbreviated, time: .shortened)`. */
function formatDateTime(at: number, zone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

/**
 * A checklist step's editable title (`Toggle(isOn:) { TextField("Preparation step", text:) }`). A long
 * title reads from its start, as iOS truncates it with an ellipsis: Android leaves an unfocused
 * single-line field scrolled to its end ("…urpose and desired result", parity pass 4), so the caret is
 * parked at the start until the field is focused.
 */
function StepTitleInput({ value, onChangeText, testID }: { value: string; onChangeText: (next: string) => void; testID: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      accessibilityLabel="Preparation step"
      onBlur={() => setFocused(false)}
      onChangeText={onChangeText}
      onFocus={() => setFocused(true)}
      placeholder="Preparation step"
      placeholderTextColor={theme.colors.placeholder}
      selection={focused ? undefined : START}
      style={[inputText(textStyles.body), styles.grow, { color: theme.colors.label }]}
      testID={testID}
      value={value}
    />
  );
}

const START = { start: 0, end: 0 };

/** A `Toggle` row whose label stays full colour. */
function ToggleRow({ label, value, onValueChange, testID }: { label: string; value: boolean; onValueChange: (next: boolean) => void; testID: string }) {
  const theme = useTheme();
  return (
    <View style={styles.inline}>
      <Text style={[textStyles.body, styles.grow, { color: theme.colors.label }]}>{label}</Text>
      <IOSSwitch accessibilityLabel={label} onValueChange={onValueChange} testID={testID} value={value} />
    </View>
  );
}

/** `.tertiaryLabel`, as `FormButton` draws a disabled title. */
function tertiaryLabel(scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? 'rgba(235, 235, 245, 0.3)' : 'rgba(60, 60, 67, 0.3)';
}

/**
 * A `Button` row in a `Form`. Not the tint: the sheet inherits TaskActionView's
 * `.foregroundStyle(Color.nexdoInk)` (:255), so its buttons and Close are ink (`follow-up-outcome-history`),
 * while the Result picker keeps the indigo tint. Tertiary grey when disabled.
 */
function LinkRow({ title, onPress, disabled = false, testID }: { title: string; onPress: () => void; disabled?: boolean; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.inline} testID={testID}>
      <Text style={[textStyles.body, { color: disabled ? tertiaryLabel(theme.scheme) : theme.colors.ink }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 16 },
  side: { minWidth: 60 },
  trailing: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  inline: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  draft: { flex: 1, minHeight: 150, paddingVertical: 8 },
  notes: { flex: 1, minHeight: 3 * 22 + 22, maxHeight: 8 * 22 + 22, paddingVertical: 11 },
  historyItem: { flex: 1, gap: 4, paddingVertical: 8 },
  caption: { fontSize: 12, lineHeight: 16 },
});
