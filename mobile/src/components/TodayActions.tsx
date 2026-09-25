import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useCoordinator } from '../actions/coordinator';
import type { StoredTaskAction, TaskActionChannel } from '../lib/taskAction';
import { notificationDate } from '../lib/taskAction';
import type { TodayActionQueue } from '../lib/todayActionQueue';
import { brand, useTheme } from '../theme';
import { GlassCard } from './GlassCard';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol, type TaskSymbolName } from './TaskSymbol';
import { Text } from './Text';

/**
 * `TodayActionsView` (ios/App/TodayActionsView.swift:9), **body `:16-46`**, and the views it renders:
 * `ActionNeededCard` (`:56`, body `:69-128`), `SnoozeMenu` (`:130`, body `:134-159`) and
 * `NextActionRow` (`:165`, body `:168-186`). `ActionGlass` (`:48-54`) is the shared card surface.
 *
 * This is section 6 of the Today dashboard, deferred from Phase 4B because nothing supplied the
 * queue until `TaskActionCoordinator` existed.
 */

/** `actionIcon(_:)` (TodayActionsView.swift:224-226). */
function actionIcon(channel: TaskActionChannel): TaskSymbolName {
  return channel === 'call' ? 'phone.fill' : channel === 'message' ? 'message.fill' : 'envelope.fill';
}

/** `actionTimeLabel(_:now:)` (TodayActionsView.swift:227-232). */
export function actionTimeLabel(action: StoredTaskAction, now: number): string {
  const seconds = ((notificationDate(action) ?? now) - now) / 1000;
  if (seconds > 0) return `in ${Math.max(1, Math.ceil(seconds / 60))} min`;
  if (seconds > -60) return 'Due now';
  return `${Math.trunc(-seconds / 60)} min overdue`;
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
  /** `selection = TodayActionSelection(action:channel:)` → the action sheet (`:40-43`). */
  onOpen: (action: StoredTaskAction, channel?: TaskActionChannel) => void;
  onViewAll: () => void;
}) {
  const theme = useTheme();
  const primary = queue.primaryAction as StoredTaskAction | null;
  const next = queue.nextActions as StoredTaskAction[];

  return (
    <View style={styles.stack} testID="today-actions">
      {primary ? (
        <ActionNeededCard
          action={primary}
          now={now}
          onExecute={(channel) => onOpen(primary, channel)}
          onTask={() => onTask(primary.taskId)}
          overdueCount={queue.overdueCount}
          timeZone={timeZone}
        />
      ) : null}

      {next.length > 0 ? (
        <GlassCard radius={22} shadow={false} stroke={ACTION_GLASS_STROKE}>
        <View style={styles.card} testID="today-actions-next">
          <View style={styles.row}>
            <TaskSymbol color={theme.colors.ink} name="clock" size={17} />
            <Text style={[styles.headline, { color: theme.colors.ink }]}>Next up</Text>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>{`${next.length} actions`}</Text>
            <View style={styles.grow} />
            <Pressable accessibilityLabel="View all" accessibilityRole="button" onPress={onViewAll} testID="today-actions-view-all">
              <Text style={[styles.subheadline, { color: theme.colors.link }]}>View all</Text>
            </Pressable>
          </View>
          {next.slice(0, 3).map((action) => (
            <View key={action.id}>
              <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
              <Pressable accessibilityRole="button" onPress={() => onOpen(action)} testID={`today-action-${action.id}`}>
                <NextActionRow action={action} now={now} timeZone={timeZone} />
              </Pressable>
            </View>
          ))}
        </View>
        </GlassCard>
      ) : null}
    </View>
  );
}

/** `ActionNeededCard` (TodayActionsView.swift:56, body `:69-128`). */
export function ActionNeededCard({
  action,
  now,
  timeZone,
  overdueCount,
  onExecute,
  onTask,
}: {
  action: StoredTaskAction;
  now: number;
  timeZone: string;
  overdueCount: number;
  onExecute: (channel: TaskActionChannel) => void;
  onTask: () => void;
}) {
  const theme = useTheme();
  const resolved = useCoordinator((state) => (action.contactIdentifier ? state.resolvedContacts[action.contactIdentifier] : undefined));

  // `channels` (TodayActionsView.swift:63-67): once a contact is known, only the channels it supports.
  const channels: TaskActionChannel[] = resolved
    ? (['call', 'message', 'email'] as const).filter((channel) => (channel === 'email' ? resolved.emails.length > 0 : resolved.phones.length > 0))
    : ['call', 'message', 'email'];

  const at = notificationDate(action) ?? now;

  return (
    // `.overlay(RoundedRectangle(cornerRadius: 22).stroke(NexdoTheme.gradient, lineWidth: 1.5))`
    // (TodayActionsView.swift:130). React Native cannot stroke a border with a gradient, so the ring
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

      {overdueCount > 1 ? (
        <Text style={[styles.caption, { color: '#FF9500' }]} testID="today-actions-overdue">
          {`${overdueCount} actions need your attention`}
        </Text>
      ) : null}

      <Text style={[styles.title2, { color: theme.colors.ink }]}>{`Time to contact ${action.contactName}`}</Text>
      {action.context ? <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>{action.context}</Text> : null}

      <View style={styles.contactRow}>
        <TaskSymbol color={brand.nexdoBlue} name="person.crop.circle.fill" size={34} />
        <View style={styles.grow}>
          <Text style={[styles.headline, { color: theme.colors.ink }]}>{resolved?.name ?? action.contactName}</Text>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>
            {resolved
              ? (resolved.phones[0]?.value ?? resolved.emails[0]?.value ?? 'No contact details')
              : 'Choose an action to find this contact'}
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

      <View style={styles.channelRow}>
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
              {/* `channel == .message ? "iMessage" : channel.rawValue.capitalized` (`:112`). */}
              <Text style={[styles.subheadline, styles.semibold, { color: colour }]}>
                {channel === 'message' ? 'iMessage' : capitalise(channel)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {channels.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => onExecute(action.preferredAction ?? 'call')} testID="today-actions-choose-contact">
          <Text style={[theme.typography.body, { color: theme.colors.link }]}>Choose contact</Text>
        </Pressable>
      ) : null}

      <View style={styles.channelRow}>
        <SnoozeMenu action={action} />
        <Pressable
          accessibilityLabel={`Dismiss ${action.contactName} action`}
          accessibilityRole="button"
          onPress={() => useCoordinator.getState().dismiss(action.id)}
          style={[styles.bordered, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.18) }]}
          testID="today-actions-dismiss"
        >
          <TaskSymbol color={theme.colors.link} name="xmark" size={15} />
          <Text style={[theme.typography.body, { color: theme.colors.link }]}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
    </ActionCardRing>
  );
}

/** `SnoozeMenu` (TodayActionsView.swift:130, body `:134-159`). */
export function SnoozeMenu({ action }: { action: StoredTaskAction }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityLabel={`Remind ${action.contactName} task later`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.bordered, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.18) }]}
        testID="today-actions-snooze"
      >
        <TaskSymbol color={theme.colors.link} name="clock" size={15} />
        <Text style={[theme.typography.body, { color: theme.colors.link }]}>Remind me later</Text>
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
          </View>
        </Pressable>
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
