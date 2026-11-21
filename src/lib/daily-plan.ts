/**
 * The pure parts of the web Daily Plan: which tasks are overdue, where "Reschedule overdue" puts them, and
 * how the weekly summary is paged. The rules are the phones' (mobile/src/lib/overdueTasks.ts,
 * mobile/src/lib/rescheduleAll.ts; ios/App/TodayAttentionSheet.swift): the effective time of a task is its
 * start, else its due date; overdue tasks are placed one after another, each taking its estimate (at least
 * one minute), and the run stops at the first failure.
 */
import type { AgendaTask } from './types';

export type WeeklySummary = {
  timeZone: string;
  start: string;
  end: string;
  headline: string;
  summary: string;
  metrics: { completed: number; planned: number; completionRate: number | null; overdue: number; focusMinutes: number };
  days: { date: string; planned: number; completed: number }[];
  accomplishments: { id: string; title: string; priority: string }[];
  limitations: string[];
};

const finished = (task: Pick<AgendaTask, 'status'>) => task.status === 'COMPLETED' || task.status === 'CANCELLED';

/** The effective time of a task (start, else due), or null when it has none. */
export function effectiveTime(task: Pick<AgendaTask, 'startAt' | 'dueAt'>): number | null {
  const value = task.startAt ?? task.dueAt;
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** Unfinished tasks whose effective time has passed, oldest first (ties by id). */
export function overdueTasks<T extends Pick<AgendaTask, 'id' | 'status' | 'startAt' | 'dueAt'>>(tasks: T[], now: number): T[] {
  return tasks
    .map((task) => ({ task, time: finished(task) ? null : effectiveTime(task) }))
    .filter((entry): entry is { task: T; time: number } => entry.time !== null && entry.time < now)
    .sort((a, b) => a.time - b.time || (a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0))
    .map((entry) => entry.task);
}

export type RescheduleSlot<T> = { task: T; startMs: number };

/** Back-to-back slots from `start`; each task takes max(1, estimate) minutes. */
export function rescheduleSlots<T extends Pick<AgendaTask, 'durationMin'>>(tasks: T[], start: number): RescheduleSlot<T>[] {
  let next = start;
  return tasks.map((task) => {
    const slot = { task, startMs: next };
    next += Math.max(1, task.durationMin) * 60_000;
    return slot;
  });
}

/** The account-zone calendar date (yyyy-MM-dd) and time (HH:mm) of an instant, as the task API takes them. */
export function zonedParts(ms: number, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** "Couldn’t reschedule X: reason. Earlier changes were saved." */
export function rescheduleFailure(title: string, reason: string): string {
  return `Couldn’t reschedule ${title}: ${reason} Earlier changes were saved.`;
}

export function rescheduleButtonTitle(saving: boolean, count: number): string {
  return saving ? 'Rescheduling…' : `Reschedule ${count} task${count === 1 ? '' : 's'}`;
}

/** A start must be in the future, and there must be something to move. */
export function canReschedule({ saving, count, start, now }: { saving: boolean; count: number; start: number; now: number }): boolean {
  return !saving && count > 0 && Number.isFinite(start) && start > now;
}

/** Monday-to-Sunday weeks, like the server's. `day` is yyyy-MM-dd. */
export function shiftWeek(day: string, weeks: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

/** "Nov 16 – Nov 22". Calendar days, formatted in UTC so they never shift. */
export function weekRange(start: string, end: string): string {
  const format = (day: string) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
  return `${format(start)} – ${format(end)}`;
}

/** "2 hr 5 min", "45 min", "0 min". */
export function focusLabel(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours === 0 ? `${rest} min` : rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** One-letter weekday for a calendar day. */
export function weekdayInitial(day: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${day}T12:00:00Z`));
}
