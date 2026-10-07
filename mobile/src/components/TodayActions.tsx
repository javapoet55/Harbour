import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCoordinator } from '../actions/coordinator';
import { businessActionContact, manualActionContact, resolveContactsSilently, type ActionContact } from '../actions/contacts';
import { DateField } from '../features/moments/form';
import { resolveActionNeeded } from '../lib/actionNeeded';
import { isBusinessAction } from '../lib/taskAgent';
import type { StoredTaskAction, TaskActionChannel } from '../lib/taskAction';
import { notificationDate } from '../lib/taskAction';
import { contactSearchName } from '../lib/taskActionDetector';
import type { TodayActionQueue } from '../lib/todayActionQueue';
import { useTaskAgent } from '../query/useTaskAgent';
import { brand, useTheme } from '../theme';
import { useAccessibilityTextSize } from '../features/wellness/useAccessibilityTextSize';
import { GlassCard } from './GlassCard';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol, type TaskSymbolName } from './TaskSymbol';
import { Text } from './Text';

/**
 * `TodayActionsView` (ios/App/TodayActionsView.swift:10-85) and the views it renders:
 * `ActionNeededCard` (`:96-226`), `SnoozeMenu` (`:228-262`) and `NextActionRow` (`:264-285`).
 * `ActionGlass` (`:87-93`) is the shared card surface.
 *
 * Phase 12: every due action gets its turn in the card ("3 Actions need attention", Previous / Next),
 * "Next up" lists only what is not due yet, and the card works out who to contact before offering
 * any channel (`ActionNeededState`): a business task sends the person to Task Details to choose one.
 */

/** `actionIcon(_:)` (TodayActionsView.swift:325-327). */
function actionIcon(channel: TaskActionChannel): TaskSymbolName {
  return channel === 'call' ? 'phone.fill' : channel === 'message' ? 'message.fill' : 'envelope.fill';
}

/** `actionDurationLabel(minutes:)` (TodayActionsView.swift:335-340): "45 min", "2 hr", "257 hr 1 min". */
export function actionDurationLabel(minutes: number): string {
  const hours = Math.trunc(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

/**
 * `actionTimeLabel(_:now:)` (TodayActionsView.swift:328-333). Android ahead of iOS, as `ActionTimeLabel` on
 * fix/ios-bug-pass (bfedbd6, 0d7e89f): both directions round to the nearest minute (future times rounded up and
 * overdue ages truncated, so 90 seconds read "in 2 min" before and "1 min overdue" after), and past 48 hours an age
 * reads in whole days ("10 days overdue", not "257 hr 1 min overdue").
 */
export function actionTimeLabel(action: StoredTaskAction, now: number): string {
  const seconds = ((notificationDate(action) ?? now) - now) / 1000;
  const minutes = Math.round(Math.abs(seconds) / 60);
  if (seconds > 0) return `in ${actionDurationLabel(Math.max(1, minutes))}`;
  if (seconds > -60) return 'Due now';
  if (minutes >= 48 * 60) return `${Math.floor(minutes / (24 * 60))} days overdue`;
  return `${actionDurationLabel(Math.max(1, minutes))} overdue`;
}

function timeLabel(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

/**
 * `ActionGlass` (TodayActionsView.swift:48-54):
 *
 *   .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22))
 *   .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.nexdoIndigo.opacity(0.22)))
 *
 * `GlassCard` reproduces `.ultraThinMaterial` with `expo-blur`. It was written for the auth cards and
 * nothing outside auth had reached for it, so these cards filled with an opaque `surface` and read as
 * flat white against the lavender backdrop. Swift's card measures (238, 238, 241).
 */
const ACTION_GLASS_STROKE = withAlpha(brand.nexdoIndigo, 0.22);

export function TodayActionsView({
  queue,
  now,
  timeZone,
  onTask,
  onOpen,
  onViewAll,
}: {
  queue: TodayActionQueue;
  now: number;
  timeZone: string;
  onTask: (taskId: string) => void;
  /**
   * `selection = TodayActionSelection(action:channel:)` → the action sheet (`:57-58`, `:78-81`). With a
   * channel the screen starts it straight away (`startSelectedAction`); without, it only opens.
   */
  onOpen: (action: StoredTaskAction, channel?: TaskActionChannel) => void;
  onViewAll: () => void;
}) {
  const theme = useTheme();
  const due = queue.dueActions as StoredTaskAction[];
  const upcoming = queue.upcomingActions as StoredTaskAction[];
  // `selectedActionID`: a choice that has left `dueActions` falls back to the first (`:76-78`).
  const [selectedActionID, setSelectedActionID] = useState<string | null>(null);
  const found = due.findIndex((action) => action.id === selectedActionID);
  const selectedIndex = found < 0 ? 0 : found;
  const action = due[selectedIndex];
  const moveAction = (offset: number) => {
    const next = due[selectedIndex + offset];
    if (next) setSelectedActionID(next.id);
  };

  return (
    <View style={styles.stack} testID="today-actions">
      {action ? (
        <>
          {due.length > 1 ? (
            <GlassCard radius={22} shadow={false} stroke={ACTION_GLASS_STROKE}>
              <View style={styles.pager} testID="today-actions-pager">
                <View style={styles.row}>
                  <Text style={[styles.headline, styles.grow, { color: theme.colors.ink }]}>{`${due.length} Actions need attention`}</Text>
                  {/* The pager is in `ActionGlass` too (TodayActionsView.swift:51): its buttons are ink. */}
                  <Pressable accessibilityLabel="View all" accessibilityRole="button" onPress={onViewAll} testID="today-actions-view-all-due">
                    <Text style={[theme.typography.body, { color: theme.colors.ink }]}>View all</Text>
                  </Pressable>
                </View>
                <View style={styles.row}>
                  <PagerButton disabled={selectedIndex === 0} icon="chevron.left" label="Previous" onPress={() => moveAction(-1)} testID="today-actions-previous" />
                  <Text style={[styles.subheadline, styles.grow, styles.centred, styles.digits, { color: theme.colors.ink }]} testID="today-actions-position">
                    {`${selectedIndex + 1} of ${due.length}`}
                  </Text>
                  <PagerButton disabled={selectedIndex === due.length - 1} icon="chevron.right" label="Next" onPress={() => moveAction(1)} testID="today-actions-next-due" trailingIcon />
                </View>
              </View>
            </GlassCard>
          ) : null}
          {/* `.id(action.id + …)`: a different action, or a different chosen business, is a new card. */}
          <ActionNeededCard
            action={action}
            key={`${action.id}-${action.businessCandidateID ?? ''}`}
            now={now}
            onChoose={() => onOpen(action)}
            onExecute={(channel) => onOpen(action, channel)}
            onTask={() => onTask(action.taskId)}
            timeZone={timeZone}
          />
        </>
      ) : null}

      {upcoming.length > 0 ? (
        <GlassCard radius={22} shadow={false} stroke={ACTION_GLASS_STROKE}>
        <View style={styles.card} testID="today-actions-next">
          <View style={styles.row}>
            <TaskSymbol color={theme.colors.ink} name="clock" size={17} />
            <Text style={[styles.headline, { color: theme.colors.ink }]}>Next up</Text>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>{`${upcoming.length} actions`}</Text>
            <View style={styles.grow} />
            <Pressable accessibilityLabel="View all" accessibilityRole="button" onPress={onViewAll} testID="today-actions-view-all">
              <Text style={[styles.subheadline, { color: theme.colors.link }]}>View all</Text>
            </Pressable>
          </View>
          {upcoming.slice(0, 3).map((item) => (
            <View key={item.id}>
              <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
              <Pressable accessibilityRole="button" onPress={() => onOpen(item)} testID={`today-action-${item.id}`}>
                <NextActionRow action={item} now={now} timeZone={timeZone} />
              </Pressable>
            </View>
          ))}
        </View>
        </GlassCard>
      ) : null}
    </View>
  );
}

/** Previous / Next: `.buttonStyle(.bordered)` at `.subheadline` (`:36-48`). */
function PagerButton({
  label,
  icon,
  disabled,
  onPress,
  testID,
  trailingIcon = false,
}: {
  label: string;
  icon: TaskSymbolName;
  disabled: boolean;
  onPress: () => void;
  testID: string;
  trailingIcon?: boolean;
}) {
  const theme = useTheme();
  // `ActionGlass`'s `.foregroundStyle(Color.nexdoInk)` (`today-action-card-contact`): ink, dimmed when disabled.
  const colour = disabled ? theme.colors.placeholder : theme.colors.ink;
  const glyph = <TaskSymbol color={colour} name={icon} size={13} />;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.pagerButton, { backgroundColor: withAlpha(brand.nexdoIndigo, disabled ? 0.06 : 0.18) }]}
      testID={testID}
    >
      {trailingIcon ? null : glyph}
      <Text style={[styles.subheadline, { color: colour }]}>{label}</Text>
      {trailingIcon ? glyph : null}
    </Pressable>
  );
}

/** `ActionNeededCard` (TodayActionsView.swift:96-226). */
export function ActionNeededCard({
  action,
  now,
  timeZone,
  onChoose,
  onExecute,
  onTask,
}: {
  action: StoredTaskAction;
  now: number;
  timeZone: string;
  /** "Choose contact or enter details": the action screen with no channel. */
  onChoose: () => void;
  onExecute: (channel: TaskActionChannel) => void;
  /** Task Details, where the business research lives. */
  onTask: () => void;
}) {
  const theme = useTheme();
  const large = useAccessibilityTextSize();
  // `model.loadTaskAgent` (`:209-224`), shared with Task Details and the action screen so a business
  // chosen there shows here at once (`taskAgentChanged`).
  const agent = useTaskAgent(action.taskId);
  const envelope = agent.data;
  const resolved = useCoordinator((state) => (action.contactIdentifier ? state.resolvedContacts[action.contactIdentifier] : undefined));

  // `business`, `contact`, `isBusiness` (`:113-123`).
  const business = envelope?.run?.candidates.find((candidate) => candidate.id === action.businessCandidateID);
  const contact: ActionContact | null = business
    ? businessActionContact(business)
    : action.manualRecipient
      ? manualActionContact(action.manualRecipient)
      : (resolved ?? null);
  const isBusiness =
    action.manualRecipient || action.contactIdentifier
      ? false
      : isBusinessAction(envelope, action.businessCandidateID);
  const state = resolveActionNeeded({
    loaded: agent.isSuccess,
    failed: agent.isError,
    business: isBusiness,
    hasResults: (envelope?.run?.candidates.length ?? 0) > 0,
    hasRecipient: contact !== null,
    hasPhone: (contact?.phones.length ?? 0) > 0,
    hasEmail: (contact?.emails.length ?? 0) > 0,
  });
  const channels = state.kind === 'ready' ? state.channels : [];

  // "Today never prompts for Contacts permission. The picker handles missing access." (`:215-223`)
  const quietLookup = agent.isSuccess && !isBusiness && !action.manualRecipient && !resolved;
  const lookupKey = quietLookup ? `${action.id}:${agent.dataUpdatedAt}` : null;
  useEffect(() => {
    if (!lookupKey) return;
    let live = true;
    void resolveContactsSilently(contactSearchName(action.contactName), action.contactIdentifier).then((matches) => {
      if (!live || !matches || matches.length !== 1) return;
      useCoordinator.getState().remember(matches[0]);
      useCoordinator.getState().update(action.id, (item) => ({ ...item, contactIdentifier: matches[0].id }));
    });
    return () => {
      live = false;
    };
  }, [lookupKey, action.id, action.contactName, action.contactIdentifier]);

  const at = notificationDate(action) ?? now;
  const channelRow = large ? styles.channelColumn : styles.channelRow;

  return (
    // `.overlay(RoundedRectangle(cornerRadius: 22).stroke(NexdoTheme.gradient, lineWidth: 1.5))`
    // (TodayActionsView.swift:226). React Native cannot stroke a border with a gradient, so the ring
    // is a `LinearGradient` behind the card with 1.5 of padding — `ActionCardRing`.
    //
    // That rules out `GlassCard` for this one card: its blur samples whatever is behind it, which is
    // now the ring, and the whole card takes the gradient. It fills with `glassSolid` instead — the
    // Swift card measured (238, 238, 241), so the difference from real glass is not visible here.
    <ActionCardRing>
    <View style={[styles.card, styles.primaryCard, { backgroundColor: theme.colors.glassSolid, borderColor: ACTION_GLASS_STROKE }]} testID="today-actions-primary">
      <View style={styles.rowTop}>
        <TaskSymbol color="#FF2D55" name="bell.fill" size={17} />
        <Text style={[styles.headline, styles.grow, { color: '#FF2D55' }]}>Action Needed</Text>
        <View style={styles.trailing}>
          <Text style={[styles.subheadline, { color: theme.colors.ink }]}>{timeLabel(at, timeZone)}</Text>
          <Text style={[styles.caption, { color: '#FF2D55' }]} testID="today-actions-time">
            {actionTimeLabel(action, now)}
          </Text>
        </View>
      </View>

      <Text style={[styles.title2, { color: theme.colors.ink }]} testID="today-actions-title">
        {isBusiness && !contact ? 'Find a business to contact' : `Time to contact ${contact?.name ?? action.contactName}`}
      </Text>
      {action.context ? <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>{action.context}</Text> : null}

      <View style={styles.contactRow}>
        <TaskSymbol color={brand.nexdoBlue} name="person.crop.circle.fill" size={34} />
        <View style={styles.grow}>
          <Text style={[styles.headline, { color: theme.colors.ink }]}>{contact?.name ?? action.contactName}</Text>
          <Text style={[styles.caption, { color: theme.colors.secondary }]} testID="today-actions-recipient">
            {contact
              ? (contact.phones[0]?.value ?? contact.emails[0]?.value ?? 'No contact details')
              : isBusiness
                ? 'Choose a nearby business for this task'
                : 'Choose a contact or enter their details'}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityLabel="Task context"
        accessibilityRole="button"
        onPress={onTask}
        style={[styles.context, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.09) }]}
        testID="today-actions-context"
      >
        <TaskSymbol color={theme.colors.ink} name="doc.text" size={17} />
        <View style={styles.grow}>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Task context</Text>
          <Text style={[styles.subheadline, { color: theme.colors.ink }]}>{action.context ?? action.sourceTitle}</Text>
        </View>
        <TaskSymbol color={theme.colors.ink} name="chevron.right" size={12} />
      </Pressable>

      {channels.length > 0 ? (
        <View style={channelRow}>
          {channels.map((channel) => {
            const colour = channel === 'call' ? '#34C759' : channel === 'message' ? brand.nexdoBlue : '#AF52DE';
            return (
              <Pressable
                accessibilityLabel={`${capitalise(channel)} ${action.contactName}`}
                accessibilityRole="button"
                key={channel}
                onPress={() => onExecute(channel)}
                style={[styles.channel, { backgroundColor: withAlpha(colour, 0.13) }]}
                testID={`today-actions-${channel}`}
              >
                <TaskSymbol color={colour} name={actionIcon(channel)} size={22} />
                {/* `channel.rawValue.capitalized` (`:150`): "Message", no longer "iMessage". */}
                <Text style={[styles.subheadline, styles.semibold, { color: colour }]}>{capitalise(channel)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* `switch state` (`:171-194`). */}
      {state.kind === 'loading' ? (
        <View style={styles.progress} testID="today-actions-checking">
          <ActivityIndicator color={theme.colors.link} size="small" />
          <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Checking next action…</Text>
        </View>
      ) : state.kind === 'retry' ? (
        <>
          <Text style={[styles.caption, { color: theme.colors.ink }]}>Couldn’t check this task. Retry or open task details.</Text>
          <Pressable accessibilityRole="button" onPress={() => void agent.refetch()} testID="today-actions-retry">
            <Text style={[theme.typography.body, { color: theme.colors.link }]}>Retry</Text>
          </Pressable>
        </>
      ) : state.kind === 'findBusiness' || state.kind === 'chooseBusiness' ? (
        // `NexdoGradientButtonStyle` (RootView.swift:2204-2216): white on `saveGradient`, a capsule.
        <Pressable accessibilityRole="button" onPress={onTask} testID="today-actions-business">
          <LinearGradient colors={[brand.nexdoBlue, brand.nexdoIndigo, brand.nexdoMagenta]} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.gradientButton}>
            <TaskSymbol color="#FFFFFF" name="magnifyingglass" size={15} />
            <Text style={[theme.typography.body, { color: '#FFFFFF' }]}>{state.kind === 'chooseBusiness' ? 'Choose a business' : 'Find businesses'}</Text>
          </LinearGradient>
        </Pressable>
      ) : state.kind === 'chooseContact' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onChoose}
          style={[styles.chooseContact, { backgroundColor: CHOOSE_CONTACT_FILL, borderColor: withAlpha(brand.nexdoIndigo, 0.2) }]}
          testID="today-actions-choose-contact"
        >
          <Text style={[styles.subheadline, styles.semibold, styles.centred, { color: CHOOSE_CONTACT_INK }]}>Choose contact or enter details</Text>
        </Pressable>
      ) : isBusiness ? (
        <Pressable accessibilityRole="button" onPress={onTask} testID="today-actions-change-business">
          <Text style={[styles.subheadline, { color: theme.colors.link }]}>Change business</Text>
        </Pressable>
      ) : null}

      <View style={channelRow}>
        {/* Android ahead of iOS: Swift names these by the task's `contactName`, not the recipient chosen since. */}
        <SnoozeMenu action={action} recipient={contact?.name ?? action.contactName} />
        <Pressable
          accessibilityLabel={`Dismiss ${contact?.name ?? action.contactName} action`}
          accessibilityRole="button"
          onPress={() => useCoordinator.getState().dismiss(action.id)}
          style={[styles.bordered, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.18) }]}
          testID="today-actions-dismiss"
        >
          {/* `.bordered` under `ActionGlass`'s `.foregroundStyle(Color.nexdoInk)` (TodayActionsView.swift:90): ink. */}
          <TaskSymbol color={theme.colors.ink} name="xmark" size={15} />
          <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
    </ActionCardRing>
  );
}

/**
 * "Choose contact or enter details" (`:183-191`): ink on a fixed lavender (0.88, 0.86, 0.98). The card
 * itself is `glassSolid`, which stays light-tinted in dark mode too, so the colours are fixed.
 */
const CHOOSE_CONTACT_FILL = 'rgb(224, 219, 250)';
const CHOOSE_CONTACT_INK = '#000016';

/** `SnoozeMenu` (TodayActionsView.swift:228-262): fixed delays, or "Choose time…". `recipient` names the button. */
export function SnoozeMenu({ action, recipient = action.contactName }: { action: StoredTaskAction; recipient?: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  // `@State date = Date().addingTimeInterval(900)`; null while the picker is closed.
  const [choosing, setChoosing] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  return (
    <>
      <Pressable
        accessibilityLabel={`Remind ${recipient} task later`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.bordered, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.18) }]}
        testID="today-actions-snooze"
      >
        {/* Ink, as Dismiss: the action card's `.foregroundStyle(Color.nexdoInk)` (`today-action-card-contact`). */}
        <TaskSymbol color={theme.colors.ink} name="clock" size={15} />
        <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Remind later</Text>
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.scrim}>
          <View style={[styles.menu, { backgroundColor: theme.colors.surface }]}>
            {[5, 10, 15, 30, 60].map((minutes) => (
              <Pressable
                accessibilityRole="button"
                key={minutes}
                onPress={() => {
                  useCoordinator.getState().snooze(action.id, Date.now() + minutes * 60_000);
                  setOpen(false);
                }}
                style={styles.menuRow}
                testID={`snooze-${minutes}`}
              >
                <Text style={[theme.typography.body, { color: theme.colors.ink }]}>
                  {minutes === 60 ? '1 hour' : `${minutes} minutes`}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const start = Date.now();
                setNow(start);
                setChoosing(start + 900_000);
                setOpen(false);
              }}
              style={styles.menuRow}
              testID="snooze-choose"
            >
              <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Choose time…</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* The "Remind later" sheet: `DatePicker("Remind me at", in: Date()...)`, Cancel and Save. */}
      <Modal
        animationType="slide"
        onRequestClose={() => setChoosing(null)}
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        visible={choosing !== null}
      >
        <SafeAreaView edges={Platform.OS === 'ios' ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']} style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
          <View style={styles.sheetBar}>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setChoosing(null)} testID="snooze-cancel">
              <Text style={[theme.typography.body, { color: theme.colors.link }]}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={[styles.headline, { color: theme.colors.ink }]}>
              Remind later
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: (choosing ?? 0) <= now }}
              disabled={(choosing ?? 0) <= now}
              hitSlop={8}
              onPress={() => {
                if (choosing !== null) useCoordinator.getState().snooze(action.id, choosing);
                setChoosing(null);
              }}
              testID="snooze-save"
            >
              <Text style={[theme.typography.body, styles.semibold, { color: theme.colors.link }]}>Save</Text>
            </Pressable>
          </View>
          {choosing !== null ? (
            <View style={styles.sheetBody}>
              <DateField includeTime label="Remind me at" minimum={now} onChange={setChoosing} testID="snooze-date" value={choosing} zone={Intl.DateTimeFormat().resolvedOptions().timeZone} />
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

/** `NextActionRow` (TodayActionsView.swift:165, body `:168-186`). */
export function NextActionRow({ action, now, timeZone }: { action: StoredTaskAction; now: number; timeZone: string }) {
  const theme = useTheme();
  const at = notificationDate(action) ?? now;
  return (
    <View
      accessibilityLabel={`Next action: ${action.sourceTitle} at ${timeLabel(at, timeZone)}, ${actionTimeLabel(action, now)}`}
      style={styles.nextRow}
    >
      <View style={styles.nextTime}>
        <Text style={[styles.caption, styles.bold, { color: theme.colors.scheduleBlue }]}>{timeLabel(at, timeZone)}</Text>
        <Text style={[styles.caption2, { color: theme.colors.secondaryLabel }]}>{actionTimeLabel(action, now)}</Text>
      </View>
      <View style={[styles.rail, { backgroundColor: brand.nexdoIndigo }]} />
      <View style={styles.grow}>
        <Text numberOfLines={2} style={[styles.subheadline, styles.semibold, { color: theme.colors.ink }]}>
          {action.sourceTitle}
        </Text>
        {action.context ? (
          <Text numberOfLines={2} style={[styles.caption, { color: theme.colors.secondaryLabel }]}>
            {action.context}
          </Text>
        ) : null}
      </View>
      <TaskSymbol color={theme.colors.ink} name={action.preferredAction ? actionIcon(action.preferredAction) : 'sparkles'} size={17} />
      <TaskSymbol color={theme.colors.secondary} name="chevron.right" size={13} />
    </View>
  );
}

/** The gradient ring `ActionNeededCard` wears (`:126`): `NexdoTheme.gradient`, 1.5pt. */
export function ActionCardRing({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient colors={[brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.ring}>
      {children}
    </LinearGradient>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13 },

  // `.padding(16)` / `.padding(18)` with corner radius 22.
  card: { gap: 12, padding: 16, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  primaryCard: { gap: 14, padding: 18, borderRadius: 20.5, borderWidth: StyleSheet.hairlineWidth },
  ring: { borderRadius: 22, padding: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  trailing: { alignItems: 'flex-end', gap: 2 },
  divider: { height: StyleSheet.hairlineWidth },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14 },
  channelRow: { flexDirection: 'row', gap: 10 },
  // `VStackLayout(spacing: 10)` at accessibility text sizes.
  channelColumn: { gap: 10 },
  centred: { textAlign: 'center' },
  digits: { fontVariant: ['tabular-nums'] },
  progress: { alignItems: 'center', gap: 8 },
  // `.padding(14)` around a `VStack(spacing: 10)`.
  pager: { gap: 10, padding: 14 },
  pagerButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, paddingHorizontal: 12, borderRadius: 999 },
  // `.padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 44)` in a capsule, full width.
  gradientButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  chooseContact: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 1 },
  sheet: { flex: 1 },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  sheetBody: { padding: 16 },
  channel: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 76, borderRadius: 16 },
  // `.buttonStyle(.bordered)` fills with the tint; it is not an outline. Measured off the Swift
  // app: (206, 202, 241) over a (238, 238, 241) card, which is `nexdoIndigo` at 18%.
  bordered: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 12 },

  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54 },
  nextTime: { width: 78, gap: 3 },
  rail: { width: 4, alignSelf: 'stretch', borderRadius: 3, marginVertical: 6 },

  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: { borderRadius: 18, paddingVertical: 8 },
  menuRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20 },
});
