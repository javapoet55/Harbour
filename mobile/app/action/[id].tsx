import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  businessActionContact,
  manualActionContact,
  resolveContacts,
  selectedActionContact,
  type ActionAddress,
  type ActionContact,
} from '../../src/actions/contacts';
import { ACTION_ERRORS, TaskActionError } from '../../src/actions/errors';
import { taskAgentApi, type TaskAgentEnvelope, type TaskAgentRun } from '../../src/api/taskAgent';
import { ActionContactDetailsSheet } from '../../src/components/ActionContactDetailsSheet';
import { TaskSymbol } from '../../src/components/TaskSymbol';
import { Text } from '../../src/components/Text';
import { withAlpha } from '../../src/components/SignInBackdrop';
import { pickContact } from '../../src/features/moments/device';
import { actionChannels, type TaskActionRecipient } from '../../src/lib/actionNeeded';
import { contactSearchName } from '../../src/lib/taskActionDetector';
import { isDone } from '../../src/lib/taskQuery';
import type { TaskActionChannel } from '../../src/lib/taskAction';
import { queryKeys } from '../../src/query/keys';
import { useCompleteTask, useTasks } from '../../src/query/useTasks';
import { useSession } from '../../src/store/session';
import { brand, useTheme } from '../../src/theme';

/**
 * `TaskActionView` (ios/App/TaskActionView.swift:101-429), **body `:146-232`**, read top to bottom.
 *
 * Phase 12: the screen works out who to contact as it opens (`loadDestination`, `:322-350`) — typed
 * details, then a business chosen from the task's research, then the person in Contacts — and only
 * offers the channels that recipient can take. "Choose contact" opens the system picker and "Enter
 * contact details" a small form; a business task sends the person to Task Details to choose one.
 *
 * Children followed: the two composers it presents (`ActionMessageComposer` and
 * `ActionEmailComposer`, TaskActionComposers.swift:22 and `:42`) are `UIViewControllerRepresentable`
 * wrappers around the SYSTEM composers, which `expo-sms` and `expo-mail-composer` open directly;
 * see `src/actions/composers.ts`.
 *
 * Reached three ways, all through the coordinator's `route`: a reminder notification (tap or one of
 * its four buttons), the Today action card, and the action queue.
 */
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
  const queryClient = useQueryClient();
  const owner = useSession((state) => state.profile?.id) ?? '';
  // `model.changeTaskStatus(task, status: "COMPLETED")` (TaskActionView.swift:197). The schedule
  // warning cannot apply to a completion, so the conflict handler is a no-op.
  const complete = useCompleteTask({ onConflict: () => undefined });

  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [businessFlow, setBusinessFlow] = useState(false);
  const [businessRun, setBusinessRun] = useState<TaskAgentRun | null>(null);
  const [channel, setChannel] = useState<TaskActionChannel | null>(null);
  const [contacts, setContacts] = useState<ActionContact[]>([]);
  const [contact, setContact] = useState<ActionContact | null>(null);
  const [addresses, setAddresses] = useState<ActionAddress[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [enteringDetails, setEnteringDetails] = useState<TaskActionRecipient | null>(null);
  const started = useRef(false);
  // `businessDraft` and `businessFlow` are read by handlers that run before a re-render.
  const businessDraft = useRef<string | null>(null);
  const businessFlowRef = useRef(false);
  // Swift cancels the `.task` when the view goes; a newer load supersedes an older one.
  const loads = useRef(0);
  const mounted = useRef(true);
  const showingTask = useRef(false);

  const action = coordinator.actions.find((item) => item.id === actionID);
  const task = tasks.data?.tasks.find((item) => item.id === action?.taskId);
  const usable = task ? !isDone(task) && task.status !== 'CANCELLED' : false;
  const usableRef = useRef(usable);
  useEffect(() => {
    usableRef.current = usable;
  }, [usable]);

  const currentAction = () => useCoordinator.getState().actions.find((item) => item.id === actionID);
  const setFlow = (value: boolean) => {
    businessFlowRef.current = value;
    setBusinessFlow(value);
  };

  /**
   * `.onAppear { coordinator.screenOpened(actionID) }` and `.onDisappear { if isRoutedAction {
   * coordinator.route = nil }; coordinator.screenClosed(actionID) }` (`:291-296`): leaving without a
   * choice before the reminder time puts the action back on its schedule.
   */
  useEffect(() => {
    mounted.current = true;
    useCoordinator.getState().screenOpened(actionID);
    return () => {
      mounted.current = false;
      loads.current += 1;
      if (useCoordinator.getState().route?.id === actionID) useCoordinator.getState().clearRoute();
      useCoordinator.getState().screenClosed(actionID);
    };
  }, [actionID]);

  /** `closeAction()` (`:425-428`). */
  const closeAction = () => {
    if (useCoordinator.getState().route?.id === actionID) useCoordinator.getState().clearRoute();
    router.back();
  };

  /**
   * `loadDestination()` (TaskActionView.swift:322-350): typed details first; with no saved contact, the
   * task's business research decides whether this is a business; otherwise the person in Contacts.
   * Resolves to the recipient found, so the caller can continue with it before the next render.
   */
  const loadDestination = async (): Promise<ActionContact | null> => {
    const current = currentAction();
    if (!current || !usableRef.current) {
      setChecking(false);
      return null;
    }
    const load = ++loads.current;
    const live = () => mounted.current && load === loads.current && usableRef.current;
    setChecking(true);
    setCheckFailed(false);
    setError(null);
    setContact(null);
    businessDraft.current = null;
    setContacts([]);
    setAddresses([]);
    try {
      if (current.manualRecipient) {
        setFlow(false);
        const typed = manualActionContact(current.manualRecipient);
        setContact(typed);
        return typed;
      }
      // The business check could not load: a person found in Contacts still carries on.
      let unchecked = false;
      let response: TaskAgentEnvelope | undefined;
      if (!current.contactIdentifier) {
        try {
          // `model.loadTaskAgent` — through the shared query, so Task Details and Today see it too.
          response = await queryClient.fetchQuery({
            queryKey: queryKeys.taskAgent.task(owner, current.taskId),
            queryFn: () => taskAgentApi.load(current.taskId),
            staleTime: 0,
          });
        } catch {
          // Android ahead of iOS: Swift stops here, so offline a plain "Call Asha" read "Couldn’t check this
          // task" although no business is involved. Only a task with a chosen business needs the check.
          if (!live()) return null;
          if (current.businessCandidateID != null) {
            setCheckFailed(true);
            return null;
          }
          unchecked = true;
        }
      }
      if (response) {
        if (!live()) return null;
        setBusinessRun(response.run);
        const business = current.businessCandidateID != null || response.intent?.eligible === true || response.run != null;
        setFlow(business);
        if (business) {
          const selected = response.run?.candidates.find((candidate) => candidate.id === current.businessCandidateID);
          if (!selected) return null;
          const value = businessActionContact(selected);
          setContact(value);
          businessDraft.current = selected.draft;
          return value;
        }
      }
      setFlow(false);
      const cached = current.contactIdentifier ? useCoordinator.getState().resolvedContacts[current.contactIdentifier] : undefined;
      if (cached) {
        setContact(cached);
        return cached;
      }
      try {
        const matches = await resolveContacts({ name: contactSearchName(current.contactName), identifier: current.contactIdentifier, fallbackName: current.contactName });
        if (!live()) return null;
        if (matches.length === 1) {
          setContact(matches[0]);
          useCoordinator.getState().remember(matches[0]);
          useCoordinator.getState().update(actionID, (item) => ({ ...item, contactIdentifier: matches[0].id }));
          return matches[0];
        }
        // Nobody found and no business check: it may be a business task, so ask for a retry as before.
        if (unchecked && matches.length === 0) setCheckFailed(true);
        else setContacts(matches);
      } catch (cause) {
        if (!live()) return null;
        if (unchecked) setCheckFailed(true);
        else setError(lookupMessage(cause));
      }
      return null;
    } finally {
      if (load === loads.current && mounted.current) setChecking(false);
    }
  };

  /** `resolve(_:)` (TaskActionView.swift:353-367): a known recipient goes straight to `choose`. */
  const resolve = async (option: TaskActionChannel, known: ActionContact | null = contact) => {
    const current = currentAction();
    if (!current || !usableRef.current || busy) return;
    setChannel(option);
    setContacts([]);
    setAddresses([]);
    setError(null);
    setReceipt(null);
    if (known) {
      choose(known, option);
      return;
    }
    setBusy(true);
    useCoordinator.getState().transitionTo(actionID, 'awaitingApproval');
    try {
      const matches = await resolveContacts({
        // "the plumber" is searched as "plumber"; the fallback keeps the name as the task wrote it.
        name: contactSearchName(current.contactName),
        identifier: current.contactIdentifier,
        fallbackName: current.contactName,
      });
      if (!mounted.current) return;
      if (matches.length === 1) choose(matches[0], option);
      else setContacts(matches);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /** `choose(_:)` (TaskActionView.swift:368-379): with no channel yet, only the recipient is set. */
  const choose = (value: ActionContact, option: TaskActionChannel | null = channel) => {
    if (!usableRef.current) return;
    setContact(value);
    setContacts([]);
    setError(null);
    if (!businessFlowRef.current && !currentAction()?.manualRecipient) {
      useCoordinator.getState().remember(value);
      useCoordinator.getState().update(actionID, (item) => ({ ...item, contactIdentifier: value.id }));
    }
    if (!option) return;
    const list = option === 'email' ? value.emails : value.phones;
    if (list.length === 0) setError(option === 'email' ? ACTION_ERRORS.noEmail : ACTION_ERRORS.noPhone);
    else if (list.length === 1) void prepare(list[0], value, option);
    else setAddresses(list);
  };

  /** `prepare(_:)` (TaskActionView.swift:380-390). */
  const prepare = async (address: ActionAddress, person: ActionContact | null = contact, option: TaskActionChannel | null = channel) => {
    const current = currentAction();
    if (!usableRef.current || !option || !current || !person) return;
    setAddresses([]);

    if (option === 'call') {
      // `.confirmationDialog("Call <name>?", …)` (`:239-243`).
      Alert.alert(`Call ${person.name}?`, address.value, [
        { text: 'Call', onPress: () => void call(address) },
        { text: 'Cancel', style: 'cancel' },
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
        ? await composeMessage({ recipient: address.value, body: businessDraft.current ?? messageBody({ name: person.name, context: current.context }) })
        : await composeEmail(emailDraft({ recipient: address.value, name: person.name, context: current.context }));
    finishCompose(result);
  };

  /** `placeCall()` (TaskActionView.swift:391-407). */
  const call = async (address: ActionAddress) => {
    if (!usableRef.current) return;
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

  /** `finishCompose(_:)` (TaskActionView.swift:408-424). */
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

  /** `resumeSelectedChannel()` (`:303-307`): after a pick or the form, carry on with the channel. */
  const resumeSelectedChannel = (picked: ActionContact) => {
    const option = channel ?? (startSelectedAction ? preferred : null);
    if (option) void resolve(option, picked);
  };

  /** The picker's `selected` (`:261-268`). Cancelling it changes nothing. */
  const chooseFromContacts = async () => {
    let picked;
    try {
      picked = await pickContact();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    if (!picked || !mounted.current) return;
    const value = selectedActionContact(picked);
    setError(null);
    setFlow(false);
    businessDraft.current = null;
    useCoordinator.getState().update(actionID, (item) => ({ ...item, manualRecipient: null, businessCandidateID: null }));
    setContact(value);
    setContacts([]);
    setAddresses([]);
    useCoordinator.getState().remember(value);
    useCoordinator.getState().update(actionID, (item) => ({ ...item, contactIdentifier: value.id }));
    resumeSelectedChannel(value);
  };

  /** The form's Save (`:279-284`). */
  const saveDetails = (recipient: TaskActionRecipient) => {
    useCoordinator.getState().update(actionID, (item) => ({ ...item, manualRecipient: recipient, contactIdentifier: null, businessCandidateID: null }));
    const value = manualActionContact(recipient);
    setContact(value);
    setContacts([]);
    setAddresses([]);
    setError(null);
    setEnteringDetails(null);
    resumeSelectedChannel(value);
  };

  /** `showingTask = true`: Task Details, where the business research lives. */
  const openTask = () => {
    const current = currentAction();
    if (!current) return;
    showingTask.current = true;
    router.push({ pathname: '/task/[id]', params: { id: current.taskId } });
  };

  /**
   * `.sheet(isPresented: $showingTask, onDismiss: { await loadDestination(); if startSelectedAction,
   * let preferred, contact != nil { resolve(preferred) } })` (`:257-259`): back from Task Details.
   */
  const loadRef = useRef(loadDestination);
  const resolveRef = useRef(resolve);
  useEffect(() => {
    loadRef.current = loadDestination;
    resolveRef.current = resolve;
  });
  useFocusEffect(
    useCallback(() => {
      if (!showingTask.current) return;
      showingTask.current = false;
      void loadRef.current().then((found) => {
        if (startSelectedAction && preferred && found) void resolveRef.current(preferred, found);
      });
    }, [startSelectedAction, preferred]),
  );

  /**
   * `.task { await model.refreshTasks(); guard usable, !Task.isCancelled; transition(to:
   * .awaitingApproval); await loadDestination(); if startSelectedAction, let preferred, contact != nil
   * { resolve(preferred) } }` (TaskActionView.swift:297-302). Runs once, as `.task` does for one view.
   */
  useEffect(() => {
    if (started.current || !action || !usable) return;
    started.current = true;
    // `.task` runs after the view is on screen, so this is deferred rather than run during the commit.
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      useCoordinator.getState().transitionTo(actionID, 'awaitingApproval');
      void loadRef.current().then((found) => {
        if (startSelectedAction && preferred && found && mounted.current) void resolveRef.current(preferred, found);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [action, usable, actionID, startSelectedAction, preferred]);

  const channels = actionChannels((contact?.phones.length ?? 0) > 0, (contact?.emails.length ?? 0) > 0);
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
              {`Contact ${contact?.name ?? action.contactName}`}
            </Text>

            {checking ? (
              <View style={styles.progress} testID="action-checking">
                <ActivityIndicator color={theme.colors.link} size="small" />
                <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Checking next action…</Text>
              </View>
            ) : checkFailed ? (
              <>
                <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Couldn’t check this task. Please retry.</Text>
                <LinkButton disabled={busy} label="Retry" onPress={() => void loadDestination()} testID="action-retry" />
              </>
            ) : businessFlow && !contact ? (
              <>
                <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Choose a business before calling or sending a message.</Text>
                <ProminentButton disabled={busy} label={(businessRun?.candidates.length ?? 0) > 0 ? 'Choose a business' : 'Find businesses'} onPress={openTask} testID="action-choose-business" />
              </>
            ) : (
              <>
                <Text style={[theme.typography.body, { color: theme.colors.secondary }]} testID="action-prompt">
                  {contact ? `Choose how to contact ${contact.name}.` : 'Choose a contact or enter a phone number or email address.'}
                </Text>
                {channels.map((option) => (
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
              </>
            )}

            {/* Above the recipient buttons, which its "Choose a contact or enter details below." points to. */}
            {error !== null ? (
              <Text style={[theme.typography.body, { color: theme.colors.danger }]} testID="action-error">
                {error}
              </Text>
            ) : null}

            {/* The recipient buttons (`:175-188`). */}
            {!checking && !checkFailed ? (
              businessFlow ? (
                <>
                  {contact ? <LinkButton disabled={busy} label="Change business" onPress={openTask} testID="action-change-business" /> : null}
                  <LinkButton disabled={busy} label="Choose someone from Contacts" onPress={() => void chooseFromContacts()} testID="action-pick-contact" />
                </>
              ) : (
                <>
                  <ProminentButton disabled={busy} label="Choose contact" onPress={() => void chooseFromContacts()} testID="action-pick-contact" />
                  <LinkButton
                    disabled={busy}
                    label="Enter contact details"
                    onPress={() =>
                      setEnteringDetails({
                        // Android ahead of iOS: Swift prefills the raw phrase ("the plumber"); this is the name as searched.
                        name: contact?.name ?? contactSearchName(action.contactName),
                        phone: contact?.phones[0]?.value ?? '',
                        email: contact?.emails[0]?.value ?? '',
                      })
                    }
                    testID="action-enter-details"
                  />
                </>
              )
            ) : null}

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

      {enteringDetails ? (
        <ActionContactDetailsSheet initial={enteringDetails} onCancel={() => setEnteringDetails(null)} onSave={saveDetails} visible />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * Android ahead of iOS: Swift reads every lookup failure, Contacts access refused included, as "No contact
 * selected…" (TaskActionView.swift:349), so the Contacts guidance never shows. Each now says what happened.
 */
function lookupMessage(cause: unknown): string {
  if (cause instanceof TaskActionError && cause.code === 'contactsDenied') return ACTION_ERRORS.contactsDenied;
  if (cause instanceof TaskActionError && cause.code === 'noContact') return 'No contact selected. Choose a contact or enter details below.';
  return 'Couldn’t look up this contact. Choose a contact or enter details below.';
}

type ButtonProps = { label: string; onPress: () => void; disabled: boolean; testID: string };

/** A plain `Button` in the screen's tint. */
/** A plain `Button` under the screen's `.foregroundStyle(Color.nexdoInk)` (TaskActionView.swift:239): ink, not the tint. */
function LinkButton({ label, onPress, disabled, testID }: ButtonProps) {
  const theme = useTheme({ elevated: true });
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} testID={testID}>
      <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

/** `.buttonStyle(.borderedProminent)`: a filled capsule in the tint. */
function ProminentButton({ label, onPress, disabled, testID }: ButtonProps) {
  const theme = useTheme({ elevated: true });
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.prominent, { backgroundColor: theme.colors.tint }]}
      testID={testID}
    >
      <Text style={[theme.typography.body, styles.semibold, { color: theme.colors.onTint }]}>{label}</Text>
    </Pressable>
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
  semibold: { fontWeight: '600' },
  // `.borderedProminent` at the regular size: a capsule, 7/14 padding.
  prominent: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, minHeight: 44, justifyContent: 'center' },
  // A `ProgressView` with a label stacks the label under the spinner.
  progress: { alignItems: 'center', gap: 8 },
  // `.padding(14).frame(maxWidth: .infinity)` with corner radius 14; a `Label` spaces by 6.
  channel: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14, borderRadius: 14, minHeight: 48 },
  candidate: { gap: 4, paddingVertical: 8 },
  divider: { height: StyleSheet.hairlineWidth },
  unavailable: { alignItems: 'center', gap: 12, paddingVertical: 32 },
});
