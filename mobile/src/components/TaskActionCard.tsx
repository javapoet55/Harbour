import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCoordinator } from '../actions/coordinator';
import type { NexdoTask } from '../api/types';
import { notificationDate } from '../lib/taskAction';
import { isDone } from '../lib/taskQuery';
import { detectTaskAction } from '../lib/taskActionDetector';
import { androidCard, brand, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The FIRST branch of `TaskActionCard` (ios/App/TaskActionView.swift:4), body `:9-40`.
 *
 * Phase 3 built only the fall-through (`ClarifyTaskActionCard`, `:42-100`) because
 * `TaskActionCoordinator` did not exist; this is the branch that now takes priority, exactly as
 * Swift orders them: a scheduled contact action wins, and the clarify card shows only when there is
 * none.
 */
export function TaskActionCard({ task, onOpen, now }: { task: NexdoTask; onOpen: (actionId: string) => void; now?: number }) {
  const theme = useTheme();
  // `Date()` inside `body`: read once per mount rather than on every render, so the card does not
  // flip its status line mid-render.
  const [clock] = useState(() => now ?? Date.now());
  const action = useCoordinator((state) => state.actions.find((item) => item.taskId === task.id));
  const notice = useCoordinator((state) => state.notice);

  // 6f079c0 (TaskActionView.swift:37-41): a COMPLETED task whose title is still a detected action keeps
  // its follow-up preparation and outcome history, opened read-mostly in the same sheet.
  if (isDone(task) && detectTaskAction(task.title, clock, task.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/action/preparation', params: { taskId: task.id } })}
        style={styles.history}
        testID="task-follow-up-history"
      >
        {/* A plain `Button` under Task Details' ink foreground (`task-details-followup-history-button`). */}
        <Text style={[styles.body, { color: theme.colors.ink }]}>Follow-up preparation and outcome history</Text>
      </Pressable>
    );
  }
  if (!action || isDone(task) || task.status === 'CANCELLED') return null;

  const at = notificationDate(action);

  /** The four mutually exclusive status lines (`:17-24`), in Swift's order. */
  const detail =
    action.status === 'cancelled'
      ? 'Reminder dismissed. Tap to take action.'
      : action.status === 'completed' || action.status === 'executing'
        ? 'Review the outcome or mark your task complete.'
        : at !== null && at > clock && (action.status === 'scheduled' || action.status === 'pending')
          ? `Reminder: ${reminderLabel(at, task.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)}`
          : 'Set a schedule to receive an action reminder.';

  return (
    <Pressable
      accessibilityLabel={`Nexdo Action: contact ${action.contactName}`}
      accessibilityRole="button"
      onPress={() => onOpen(action.id)}
      // Android: the shared card hairline and surface (docs/android-polish.md §2).
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.18) }, androidCard(theme)]}
      testID="task-action-card"
    >
      <View style={styles.row}>
        <TaskSymbol color={theme.colors.link} name="sparkles" size={15} />
        <Text style={[styles.subheadline, styles.bold, { color: theme.colors.link }]}>Nexdo Action</Text>
      </View>
      <Text style={[styles.headline, { color: theme.colors.ink }]}>{`Contact ${action.contactName}`}</Text>
      <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>Call • Message • Email</Text>
      <Text style={[styles.caption, { color: theme.colors.secondary }]} testID="task-action-card-detail">
        {detail}
      </Text>
      {notice !== null ? (
        <Text style={[styles.caption, { color: '#FF9500' }]} testID="task-action-card-notice">
          {notice}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** `date.formatted(date: .abbreviated, time: .shortened)`. */
function reminderLabel(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}

const styles = StyleSheet.create({
  // A plain `Button` in the details column: the tint, at least a 44-point target.
  history: { minHeight: 44, justifyContent: 'center' },
  body: { fontSize: 17, lineHeight: 22 },
  bold: { fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  // `.padding(16)` with corner radius 18.
  card: { gap: 6, padding: 16, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
