import type { CalendarEvent, NexdoTask } from '../../api/types';
import { eventDayZone } from '../../lib/deviceCalendarEvent';
import { dayKey, parseServerDate } from '../../lib/taskQuery';

/**
 * `CalendarDayIndex` (bb57e09, ios/Sources/NexdoCore/CalendarDayIndex.swift): every task and event of
 * the visible days, filed under each `yyyy-MM-dd` it falls on. Built once per data refresh, so picking
 * another date is a lookup rather than a re-parse of every timestamp (Swift built it after a 2,000-event
 * month made date selection stall).
 *
 * The rules are the existing ones: a task under the day of its start and the day of its due date (once
 * if both are the same day), an event under every day from its start to the instant before its end —
 * so an event ending at midnight does not spill into the next day. Tasks are NOT filtered by status
 * here; the screen applies its Open/Completed filter on top, as before.
 */
export type CalendarDayIndex = {
  tasks: Record<string, NexdoTask[]>;
  events: Record<string, CalendarEvent[]>;
};

export const EMPTY_DAY_INDEX: CalendarDayIndex = { tasks: {}, events: {} };

export function buildCalendarDayIndex({ days, timeZone, tasks, events }: { days: string[]; timeZone: string; tasks: NexdoTask[]; events: CalendarEvent[] }): CalendarDayIndex {
  const valid = new Set(days);
  const index: CalendarDayIndex = { tasks: {}, events: {} };

  for (const task of tasks) {
    const keys = new Set(
      [task.startAt, task.dueAt]
        .map((value) => parseServerDate(value ?? null))
        .filter((at): at is number => at !== null)
        .map((at) => dayKey(at, timeZone)),
    );
    for (const key of keys) if (valid.has(key)) (index.tasks[key] ??= []).push(task);
  }

  for (const event of events) {
    const start = parseServerDate(event.startAt);
    const end = parseServerDate(event.endAt);
    if (start === null || end === null || !(end > start)) continue;
    const zone = eventDayZone(event, timeZone);
    const first = dayKey(start, zone);
    const last = dayKey(end - 1, zone);
    for (const key of days) if (key >= first && key <= last) (index.events[key] ??= []).push(event);
  }

  return index;
}
