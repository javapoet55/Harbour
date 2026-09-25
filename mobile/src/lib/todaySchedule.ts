import type { Agenda, CalendarEvent, NexdoTask, ScheduleIntelligenceResponse } from '../api/types';
import { serverTime } from './taskLabels';
import { dayKey, DISTANT_FUTURE, isDone, parseServerDate } from './taskQuery';

/**
 * The private helpers on `TodayView` (ios/App/RootView.swift:930-1015), lifted out so they can be
 * tested: `taskDetail`, `scheduleOrder`, `schedule`, `counts`, `greeting` and `dateLabel`.
 */

/** `TodayRange` (RootView.swift:894-898). The raw value is the number of days. */
export const TODAY_RANGES = [1, 3, 5] as const;
export type TodayRange = (typeof TODAY_RANGES)[number];

export function rangeTitle(range: TodayRange): string {
  return range === 1 ? 'Today' : `${range} days`;
}

/** `TodayScheduleItem` (RootView.swift:900-909). */
export type TodayScheduleItem = {
  id: string;
  sourceId: string;
  title: string;
  dateValue: string;
  timeLabel: string;
  detail: string;
  task: NexdoTask | null;
  isPast: boolean;
};

/** `taskDetail(_:deadlineOnly:)` (RootView.swift:930-933). */
export function taskDetail(task: NexdoTask, deadlineOnly: boolean): string {
  if (task.priority === 'CRITICAL' || task.critical === true) return 'Critical task';
  return deadlineOnly ? 'Task deadline' : 'Planned task';
}

function isCritical(item: TodayScheduleItem): boolean {
  return item.task?.priority === 'CRITICAL' || item.task?.critical === true;
}

/**
 * `scheduleOrder(_:_:)` (RootView.swift:935-940): critical first, then by date. An unparseable date
 * sorts last, as `.distantFuture`.
 */
export function scheduleOrder(left: TodayScheduleItem, right: TodayScheduleItem): number {
  const leftCritical = isCritical(left);
  const rightCritical = isCritical(right);
  if (leftCritical !== rightCritical) return leftCritical ? -1 : 1;
  const leftAt = parseServerDate(left.dateValue) ?? DISTANT_FUTURE;
  const rightAt = parseServerDate(right.dateValue) ?? DISTANT_FUTURE;
  return leftAt - rightAt;
}

/** `ServerDate.occurs` (Models.swift:221-228): does an event cover this local day? */
export function eventOccursOn(event: CalendarEvent, day: string, timeZone: string): boolean {
  const start = parseServerDate(event.startAt);
  const end = parseServerDate(event.endAt);
  if (start === null || end === null || end <= start) return false;
  // "An event ending exactly at midnight does not occupy the following day."
  const lastDay = dayKey(end - 1, timeZone);
  return dayKey(start, timeZone) <= day && lastDay >= day;
}

/**
 * `schedule` (RootView.swift:942-981).
 *
 * For the Today range with schedule intelligence loaded, the server's timeline IS the schedule.
 * Otherwise it is built from the agenda: events that fall on a selected day, plus open tasks
 * scheduled on one.
 */
export function buildSchedule({
  agenda,
  tasks,
  intelligence,
  range,
  now = Date.now(),
}: {
  agenda: Agenda | null | undefined;
  tasks: NexdoTask[];
  intelligence: ScheduleIntelligenceResponse | null | undefined;
  range: TodayRange;
  now?: number;
}): TodayScheduleItem[] {
  if (!agenda) return [];

  if (range === 1 && intelligence?.today) {
    const snapshot = intelligence.today;
    return snapshot.timeline.map((item) => {
      const task =
        item.kind === 'task'
          ? (tasks.find((candidate) => candidate.id === item.sourceId) ??
            agenda.tasks.find((candidate) => candidate.id === item.sourceId) ??
            null)
          : null;
      return {
        id: item.id,
        sourceId: item.sourceId,
        title: item.title,
        dateValue: item.startAt,
        timeLabel: item.allDay
          ? 'All day'
          : item.deadlineOnly
            ? `Due ${serverTime(item.startAt, snapshot.timeZone)}`
            : serverTime(item.startAt, snapshot.timeZone),
        detail: task ? taskDetail(task, item.deadlineOnly) : 'Calendar appointment',
        task,
        isPast: item.past,
      };
    });
  }

  // `selectedDays` (RootView.swift:928): the first `range` days of the agenda's range.
  const selectedDays = new Set((agenda.range.days ?? []).slice(0, range));

  const eventItems: TodayScheduleItem[] = agenda.events
    .filter((event) => [...selectedDays].some((day) => eventOccursOn(event, day, agenda.timeZone)))
    .map((event) => ({
      id: `event:${event.id}`,
      sourceId: event.id,
      title: event.title,
      dateValue: event.startAt,
      timeLabel: event.allDay === true ? 'All day' : serverTime(event.startAt, agenda.timeZone),
      detail: 'Calendar appointment',
      task: null,
      isPast: (parseServerDate(event.endAt) ?? DISTANT_FUTURE) < now,
    }));

  const taskItems: TodayScheduleItem[] = agenda.tasks
    .filter((task) => {
      if (isDone(task) || task.status === 'CANCELLED') return false;
      const value = task.startAt ?? task.dueAt;
      if (!value) return false;
      const at = parseServerDate(value);
      if (at === null) return false;
      return selectedDays.has(dayKey(at, task.timeZone ?? agenda.timeZone));
    })
    .map((task) => {
      const value = (task.startAt ?? task.dueAt) as string;
      const zone = task.timeZone ?? agenda.timeZone;
      return {
        id: `task:${task.id}`,
        sourceId: task.id,
        title: task.title,
        dateValue: value,
        timeLabel: task.startAt ? serverTime(value, zone) : `Due ${serverTime(value, zone)}`,
        detail: taskDetail(task, !task.startAt),
        task,
        isPast: false,
      };
    });

  return [...eventItems, ...taskItems].sort(scheduleOrder);
}

/** `counts` (RootView.swift:983-986): appointments are the rows with no task. */
export function scheduleCounts(schedule: TodayScheduleItem[]): { appointments: number; tasks: number } {
  const appointments = schedule.filter((item) => item.task === null).length;
  return { appointments, tasks: schedule.length - appointments };
}

/** `greeting` (RootView.swift:1000-1008), in the ACCOUNT zone rather than the device zone. */
export function greeting(timeZone: string, now: number = Date.now()): string {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
  } catch {
    hour = new Date(now).getHours();
  }
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** `dateLabel` (RootView.swift:1010-1015): `EEE, MMM d, yyyy`. */
export function dateLabel(timeZone: string, now: number = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(now));
  } catch {
    return '';
  }
}
