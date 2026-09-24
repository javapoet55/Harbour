import { contactSearchName } from '../../src/lib/taskActionDetector';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCoordinator } from '../../src/actions/coordinator';
import {
  canSendEmail,
  canSendMessage,
  composeEmail,
  composeMessage,
  emailDraft,
  messageBody,
  placeCall,
  type ActionComposeResult,
} from '../../src/actions/composers';
import { resolveContacts, type ActionAddress, type ActionContact } from '../../src/actions/contacts';
import { ACTION_ERRORS } from '../../src/actions/errors';
import { TaskSymbol } from '../../src/components/TaskSymbol';
import { Text } from '../../src/components/Text';
import { withAlpha } from '../../src/components/SignInBackdrop';
import { isDone } from '../../src/lib/taskQuery';
import type { TaskActionChannel } from '../../src/lib/taskAction';
import { useCompleteTask, useTasks } from '../../src/query/useTasks';
import { brand, useTheme } from '../../src/theme';

/**
 * `TaskActionView` (ios/App/TaskActionView.swift:101), **body `:133-236`**, read top to bottom.
 *
 * Children followed: none of its own — the two composers it presents (`ActionMessageComposer` and
 * `ActionEmailComposer`, TaskActionComposers.swift:22 and `:42`) are `UIViewControllerRepresentable`
 * wrappers around the SYSTEM composers, which `expo-sms` and `expo-mail-composer` open directly;
 * see `src/actions/composers.ts`.
 *
 * Reached three ways, all through the coordinator's `route`: a reminder notification (tap or one of
 * its four buttons), the Today action card, and the action queue.
 */
const CHANNELS: TaskActionChannel[] = ['call', 'message', 'email'];

export default function TaskAction() {
  // A `.sheet` at `.presentationDetents([.large])` (TaskActionView.swift:222), so the backgrounds
  // resolve one level up (style map section 3).
  const theme = useTheme({ elevated: true });
  const params = useLocalSearchParams<{ id?: string; preferred?: string; start?: string }>();
  const actionID = typeof params.id === 'string' ? params.id : '';
  const preferred = isChannel(params.preferred) ? params.preferred : null;
  const startSelectedAction = params.start === '1';

  const coordinator = useCoordinator();
  const tasks = useTasks();
  // `model.changeTaskStatus(task, status: "COMPLETED")` (TaskActionView.swift:177). The schedule
  // warning cannot apply to a completion, so the conflict handler is a no-op.
  const complete = useCompleteTask({ onConflict: () => undefined });

  const [channel, setChannel] = useState<TaskActionChannel | null>(null);
  const [contacts, setContacts] = useState<ActionContact[]>([]);
  const [contact, setContact] = useState<ActionContact | null>(null);
  const [addresses, setAddresses] = useState<ActionAddress[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const started = useRef(false);

  const action = coordinator.actions.find((item) => item.id === actionID);
  const task = tasks.data?.tasks.find((item) => item.id === action?.taskId);
  const usable = task ? !isDone(task) && task.status !== 'CANCELLED' : false;

  /** `.onDisappear { if isRoutedAction { coordinator.route = nil } }` (`:225-228`). */
  // Leaving without a choice before the reminder time puts the action back on its schedule (`release`).
  useEffect(
    () => () => {
      if (useCoordinator.getState().route?.id === actionID) useCoordinator.getState().clearRoute();
      useCoordinator.getState().release(actionID);
    },
    [actionID],
  );

  const closeAction = () => {
    if (useCoordinator.getState().route?.id === actionID) useCoordinator.getState().clearRoute();
    useCoordinator.getState().release(actionID);
    router.back();
  };

  /** `resolve(_:)` (TaskActionView.swift:242-256). */
  const resolve = async (option: TaskActionChannel) => {
    const current = useCoordinator.getState().actions.find((item) => item.id === actionID);
    if (!current || !usable || busy) return;
    setChannel(option);
    setContacts([]);
    setAddresses([]);
    setError(null);
    setReceipt(null);
    setBusy(true);
    useCoordinator.getState().transitionTo(actionID, 'awaitingApproval');
    try {
      const matches = await resolveContacts({
        // "the plumber" is searched as "plumber"; the fallback keeps the name as the task wrote it.
        name: contactSearchName(current.contactName),
        identifier: current.contactIdentifier,
        fallbackName: current.contactName,
      });
      if (matches.length === 1) choose(matches[0], option);
      else setContacts(matches);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /** `choose(_:)` (TaskActionView.swift:257-265). */
  const choose = (value: ActionContact, option: TaskActionChannel | null = channel) => {
    if (!usable) return;
    setContact(value);
    setContacts([]);
    useCoordinator.getState().remember(value);
    useCoordinator.getState().update(actionID, (item) => ({ ...item, contactIdentifier: value.id }));
    const list = option === 'email' ? value.emails : value.phones;
    if (list.length === 0) setError(option === 'email' ? ACTION_ERRORS.noEmail : ACTION_ERRORS.noPhone);
    else if (list.length === 1) void prepare(list[0], value, option);
    else setAddresses(list);
  };

  /** `prepare(_:)` (TaskActionView.swift:266-275). */
  const prepare = async (address: ActionAddress, person: ActionContact | null = contact, option: TaskActionChannel | null = channel) => {
    const current = useCoordinator.getState().actions.find((item) => item.id === actionID);
    if (!usable || !option || !current || !person) return;
    setAddresses([]);

    if (option === 'call') {
      // `.confirmationDialog("Call <name>?", …)` (`:213-216`).
      Alert.alert(`Call ${person.name}?`, address.value, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call', onPress: () => void call(address) },
      ]);
      return;
    }

    const available = option === 'message' ? await canSendMessage() : await canSendEmail();
    if (!available) {
      setError(ACTION_ERRORS.unavailable);
      return;
    }
    // "Approval is to open an editable composer, never to send automatically."
    if (!useCoordinator.getState().approveExecution(actionID)) return;

    const result =
      option === 'message'
        ? await composeMessage({ recipient: address.value, body: messageBody({ name: person.name, context: current.context }) })
        : await composeEmail(emailDraft({ recipient: address.value, name: person.name, context: current.context }));
    finishCompose(result);
  };

  /** `placeCall()` (TaskActionView.swift:276-295). */
  const call = async (address: ActionAddress) => {
    if (!usable) return;
    if (!useCoordinator.getState().approveExecution(actionID)) return;
    try {
      const accepted = await placeCall(address.value);
      if (accepted) {
        setReceipt('Opened Phone. Nexdo can’t verify whether the call connected. Mark the task complete when you’re done.');
      } else {
        useCoordinator.getState().transitionTo(actionID, 'failed');
        setError('Phone couldn’t open this number.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /** `finishCompose(_:)` (TaskActionView.swift:296-309). */
  const finishCompose = (result: ActionComposeResult) => {
    if (result === 'submitted') {
      useCoordinator.getState().transitionTo(actionID, 'completed');
      setReceipt('Submitted to the messaging app. Delivery isn’t verified. You can mark the task complete when you’re done.');
      return;
    }
    if (result === 'failed') {
      useCoordinator.getState().transitionTo(actionID, 'failed');
      setError('The message couldn’t be submitted. Please try again.');
      return;
    }
    useCoordinator.getState().transitionTo(actionID, 'awaitingApproval');
    setReceipt(result === 'saved' ? 'Draft saved. Nothing was sent.' : 'Cancelled. Nothing was sent.');
  };

  /**
   * `.task { await model.refreshTasks(); … transition(to: .awaitingApproval); if startSelectedAction,
   * let preferred { resolve(preferred) } }` (TaskActionView.swift:229-235).
   *
   * The ref makes it run once, which is what `.task` does for a given view identity; re-running on a
   * later render is therefore a no-op, so `resolve` can stay in the dependency list honestly.
   */
  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  });

  useEffect(() => {
    if (started.current || !action || !usable) return;
    started.current = true;
    // `.task` runs after the view is on screen, so this is deferred rather than run during the commit.
    const timer = setTimeout(() => {
      useCoordinator.getState().transitionTo(actionID, 'awaitingApproval');
      if (startSelectedAction && preferred) void resolveRef.current(preferred);
    }, 0);
    return () => clearTimeout(timer);
  }, [action, usable, actionID, startSelectedAction, preferred]);

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {/* `.navigationTitle("Nexdo Action")` with a leading Close (TaskActionView.swift:206-208). */}
      <View style={styles.navBar}>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={closeAction} testID="action-close">
          <Text style={[theme.typography.body, { color: theme.colors.link }]}>Close</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.navTitle, styles.grow, { color: theme.colors.ink }]}>
          Nexdo Action
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {action && usable ? (
          <>
            <Text style={[styles.title2, { color: theme.colors.ink }]} testID="action-title">
              {`Time to contact ${action.contactName}`}
            </Text>
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>How would you like to get in touch?</Text>

            {CHANNELS.map((option) => (
              <Pressable
                accessibilityLabel={`${channelTitle(option)} ${action.contactName}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                key={option}
                onPress={() => void resolve(option)}
                style={[styles.channel, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.08) }]}
                testID={`action-${option}`}
              >
                {/* A `Label` spaces its glyph from its title by 6, not by the row's own 8. */}
                <TaskSymbol color={theme.colors.ink} name={channelIcon(option)} size={17} />
                <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{channelTitle(option)}</Text>
                {(channel ?? preferred) === option ? <TaskSymbol color={theme.colors.ink} name="checkmark" size={17} /> : null}
              </Pressable>
            ))}

            {busy ? (
              // `ProgressView("Finding contact…")` puts its label under the spinner.
              <View style={styles.progress}>
                <ActivityIndicator color={theme.colors.link} size="small" />
                <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Finding contact…</Text>
              </View>
            ) : null}

            {contacts.length > 0 ? (
              <>
                <Text style={[styles.headline, { color: theme.colors.ink }]}>Choose the correct contact</Text>
                {contacts.map((candidate) => (
                  <Pressable
                    accessibilityRole="button"
                    key={candidate.id}
                    onPress={() => choose(candidate)}
                    style={styles.candidate}
                    testID={`action-contact-${candidate.id}`}
                  >
                    <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{candidate.name}</Text>
                    {/* `.foregroundStyle(.secondary)` is `.secondaryLabel`, not nexdoSecondary (`:159`). */}
                    <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>
                      {candidate.phones[0]?.value ?? candidate.emails[0]?.value ?? 'No contact details'}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            {addresses.length > 0 ? (
              <>
                <Text style={[styles.headline, { color: theme.colors.ink }]}>
                  {channel === 'email' ? 'Choose an email address' : 'Choose a phone number'}
                </Text>
                {addresses.map((address) => (
                  <Pressable
                    accessibilityRole="button"
                    key={address.id}
                    onPress={() => void prepare(address)}
                    style={styles.candidate}
                    testID={`action-address-${address.id}`}
                  >
                    <Text style={[theme.typography.body, { color: theme.colors.link }]}>{`${address.label}: ${address.value}`}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            {error !== null ? (
              <Text style={[theme.typography.body, { color: theme.colors.danger }]} testID="action-error">
                {error}
              </Text>
            ) : null}
            {/* `.foregroundStyle(.secondary)` (TaskActionView.swift:173). */}
            {receipt !== null ? (
              <Text style={[theme.typography.body, { color: theme.colors.secondaryLabel }]} testID="action-receipt">
                {receipt}
              </Text>
            ) : null}

            {action.status === 'executing' || action.status === 'completed' ? (
              <Pressable
                accessibilityLabel="Mark task complete"
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => {
                  if (!task) return;
                  setBusy(true);
                  complete.mutate(task, {
                    onSuccess: () => closeAction(),
                    onError: (cause) => setError(cause.message),
                    onSettled: () => setBusy(false),
                  });
                }}
                testID="action-complete-task"
              >
                <Text style={[theme.typography.body, { color: theme.colors.link }]}>Mark task complete</Text>
              </Pressable>
            ) : null}

            <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />

            <Pressable
              accessibilityLabel="Remind me in 15 minutes"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => {
                useCoordinator.getState().snooze(actionID);
                closeAction();
              }}
              testID="action-snooze"
            >
              {/* `Button("Remind me in 15 minutes")` (TaskActionView.swift:186) carries no
                  `.buttonStyle`, and the view sets `.foregroundStyle(Color.nexdoInk)` (`:209`), so the
                  label is ink — not the tint. Measured: iOS (0, 0, 22), Android was (61, 41, 240). */}
              <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Remind me in 15 minutes</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Dismiss"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => {
                useCoordinator.getState().dismiss(actionID);
                closeAction();
              }}
              testID="action-dismiss"
            >
              <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Dismiss</Text>
            </Pressable>

            {action.contactIdentifier ? (
              <Pressable
                accessibilityLabel="Choose a different contact"
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => {
                  useCoordinator.getState().update(actionID, (item) => ({ ...item, contactIdentifier: null }));
                  setContact(null);
                  setContacts([]);
                  setAddresses([]);
                  if (channel) void resolve(channel);
                }}
                testID="action-change-contact"
              >
                <Text style={[styles.subheadline, { color: theme.colors.link }]}>Choose a different contact</Text>
              </Pressable>
            ) : null}

            {coordinator.notice !== null ? (
              <>
                <Text style={[styles.caption, { color: '#FF9500' }]} testID="action-notice">
                  {coordinator.notice}
                </Text>
                <Pressable
                  accessibilityLabel="Retry reminders"
                  accessibilityRole="button"
                  onPress={() => useCoordinator.getState().retryNotifications()}
                  testID="action-retry-reminders"
                >
                  <Text style={[theme.typography.body, { color: theme.colors.link }]}>Retry reminders</Text>
                </Pressable>
              </>
            ) : null}
          </>
        ) : (
          /* `ContentUnavailableView("Task unavailable", …)` (TaskActionView.swift:202-203). */
          <View style={styles.unavailable} testID="action-unavailable">
            {/* A `ContentUnavailableView` is a ~52pt secondary glyph, a `.label` title and a
                `.secondaryLabel` description. */}
            <TaskSymbol color={theme.colors.secondaryLabel} name="checkmark.circle" size={52} />
            <Text style={[styles.title2, { color: theme.colors.label }]}>Task unavailable</Text>
            <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondaryLabel }]}>
              This task may be completed, deleted, or rescheduled. Open your task list to check it.
            </Text>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={closeAction} testID="action-close-unavailable">
              <Text style={[theme.typography.body, { color: theme.colors.link }]}>Close</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function isChannel(value: unknown): value is TaskActionChannel {
  return value === 'call' || value === 'message' || value === 'email';
}

/** `title(_:)` (TaskActionView.swift:240). */
function channelTitle(channel: TaskActionChannel): string {
  return channel === 'call' ? 'Call' : channel === 'message' ? 'Message' : 'Email';
}

/** `icon(_:)` (TaskActionView.swift:241). */
function channelIcon(channel: TaskActionChannel): 'phone' | 'message' | 'envelope' {
  return channel === 'call' ? 'phone' : channel === 'message' ? 'message' : 'envelope';
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  centred: { textAlign: 'center' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  // `.subheadline` carries its own 21pt leading (style map section 2).
  subheadline: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },

  navBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 14 },
  navTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', textAlign: 'center', marginRight: 44 },

  // `VStack(alignment: .leading, spacing: 18).padding(20)`
  scroll: { padding: 20, gap: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // A `ProgressView` with a label stacks the label under the spinner.
  progress: { alignItems: 'center', gap: 8 },
  // `.padding(14).frame(maxWidth: .infinity)` with corner radius 14; a `Label` spaces by 6.
  channel: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14, borderRadius: 14, minHeight: 48 },
  candidate: { gap: 4, paddingVertical: 8 },
  divider: { height: StyleSheet.hairlineWidth },
  unavailable: { alignItems: 'center', gap: 12, paddingVertical: 32 },
});
