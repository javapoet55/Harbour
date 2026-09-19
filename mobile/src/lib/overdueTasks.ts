import type { NexdoTask } from '../api/types';
import { isDone, parseServerDate } from './taskQuery';

/**
 * Port of `OverdueTasks` (ios/Sources/NexdoCore/OverdueTasks.swift).
 *
 * "Match unfinished overdue tasks based on the effective task timestamp. Prefer a scheduled start
 * when present; otherwise use the deadline timestamp."
 */
export function overdueResults(tasks: NexdoTask[], now: number = Date.now()): NexdoTask[] {
  const withDeadline: { task: NexdoTask; deadline: number }[] = [];

  for (const task of tasks) {
    if (isDone(task) || task.status === 'CANCELLED') continue;
    const value = task.startAt ?? task.dueAt;
    if (!value) continue;
    const deadline = parseServerDate(value);
    if (deadline === null || deadline >= now) continue;
    withDeadline.push({ task, deadline });
  }

  return withDeadline
    .sort((left, right) =>
      left.deadline === right.deadline
        ? left.task.id < right.task.id
          ? -1
          : left.task.id > right.task.id
            ? 1
            : 0
        : left.deadline - right.deadline,
    )
    .map((entry) => entry.task);
}

/** `deadlineLabel(_:task:)` (ios/App/OverdueTasksView.swift:6-13): medium date, short time. */
export function overdueDeadlineLabel(at: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at));
  } catch {
    return '';
  }
}

/**
 * The Needs attention sheet's "Overdue · 10 Aug" (ios/App/TodayAttentionSheet.swift:44):
 * `due.formatted(.dateTime.month(.abbreviated).day())`, in the DEVICE locale and zone as
 * `Date.formatted` uses — "10 Aug" on the capture's locale, "Aug 10" on a US one.
 */
export function overdueDay(at: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(at));
}
