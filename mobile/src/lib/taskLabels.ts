import type { NexdoTask } from '../api/types';
import { DISTANT_FUTURE, dayKey, parseServerDate, startOfDay } from './taskQuery';

/**
 * The strings the task list draws. Ports `ServerDate.time` (Models.swift:213-219) and the two private
 * helpers on `TasksView` (`sectionTitle`, `taskSubtitle`; RootView.swift:1877-1897).
 */

/** `ServerDate.time(_:timeZone:)`: `DateFormatter` with `timeStyle = .short` in the account zone. */
export function serverTime(value: string, timeZone: string): string {
  const at = parseServerDate(value);
  if (at === null) return 'Time unavailable';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  } catch {
    return 'Time unavailable';
  }
}

/**
 * `TasksView.sectionTitle` (RootView.swift:1877-1886).
 *
 * `date` is the section's local midnight, as `snapshot` produces it.
 */
export function sectionTitle(date: number, timeZone: string, now: number = Date.now()): string {
  if (date === DISTANT_FUTURE) return 'Unscheduled';
  const today = startOfDay(now, timeZone);
  const day = dayKey(date, timeZone);
  if (day === dayKey(today, timeZone)) return 'Today';
  if (day === dayKey(today - 43_200_000, timeZone)) return 'Yesterday';
  if (day === dayKey(today + 129_600_000, timeZone)) return 'Tomorrow';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' })
      .format(new Date(date))
      // Intl gives "Friday, Sep 18"; Swift's "EEEE, MMM d" gives the same, without a leading zero.
      .replace(/ /g, ' ');
  } catch {
    return 'Unscheduled';
  }
}

/**
 * `TasksView.taskSubtitle` (RootView.swift:1887-1897): the time or "Unscheduled", then the estimate,
 * joined with a middle dot. A whole number of hours reads as hours.
 */
export function taskSubtitle(task: NexdoTask, fallbackZone: string): string {
  const parts: string[] = [];
  const scheduled = task.startAt ?? task.dueAt;
  parts.push(scheduled ? serverTime(scheduled, task.timeZone ?? fallbackZone) : 'Unscheduled');
  if (task.durationMin > 0) {
    parts.push(task.durationMin % 60 === 0 ? `${task.durationMin / 60} hr` : `${task.durationMin} min`);
  }
  return parts.join(' · ');
}

/** `TaskRow.scheduleLabel` (RootView.swift:1566-1569): the badge time, or nothing when unscheduled. */
export function scheduleLabel(task: NexdoTask, fallbackZone: string): string | null {
  const scheduled = task.startAt ?? task.dueAt;
  return scheduled ? serverTime(scheduled, task.timeZone ?? fallbackZone) : null;
}

/** `TaskRow.priorityColor` (RootView.swift:1557-1564). */
export function priorityColor(priority: string, brand: { nexdoBlue: string; nexdoIndigo: string }): string {
  switch (priority) {
    case 'CRITICAL':
      return '#FF3B30'; // .red
    case 'HIGH':
      return '#FF9500'; // .orange
    case 'LOW':
      return brand.nexdoBlue;
    default:
      return brand.nexdoIndigo;
  }
}
