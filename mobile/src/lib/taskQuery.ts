import type { NexdoTask } from '../api/types';

/**
 * Port of `ios/Sources/NexdoCore/TaskQuery.swift`.
 *
 * Swift loads every task once and filters on the device, so this runs over the whole array on each
 * render. It is written as one pass that produces the selected list, the day sections AND the count
 * for every date pill together, exactly as `snapshot(_:timeZone:now:calendar:)` does — the pill counts
 * must come from the same filtered pass, or a pill would disagree with the list it opens.
 *
 * Dates are compared as epoch milliseconds throughout. The only calendar arithmetic that needs a real
 * time zone is "which day is this instant in", which `dayKey` does through `Intl.DateTimeFormat`.
 */

/** `TaskDateFilter` (TaskQuery.swift:10-22). Raw values are the pill labels. */
export const TASK_DATE_FILTERS = ['Today', 'Tomorrow', 'This Week', 'All'] as const;
export type TaskDateFilter = (typeof TASK_DATE_FILTERS)[number];

/** `TaskDateFilter.emptyTitle` (TaskQuery.swift:13-21). */
export const DATE_FILTER_EMPTY_TITLE: Record<TaskDateFilter, string> = {
  All: 'You’re all caught up',
  Today: 'Nothing scheduled for today',
  Tomorrow: 'Nothing scheduled for tomorrow',
  'This Week': 'Your week is clear',
};

/** `TaskHistoryRange` (TaskQuery.swift:24-42). */
export const TASK_HISTORY_RANGES = ['Last 2 weeks', 'This Month', 'Last Month'] as const;
export type TaskHistoryRange = (typeof TASK_HISTORY_RANGES)[number];

/** `TaskQuery` (TaskQuery.swift:44-52). */
export type TaskQuery = {
  date: TaskDateFilter;
  search: string;
  status: 'Open' | 'Completed' | 'All';
  priority: string;
  earliestFirst: boolean;
  historyRange: TaskHistoryRange;
};

export const DEFAULT_TASK_QUERY: TaskQuery = {
  date: 'Today',
  search: '',
  status: 'Open',
  priority: 'All',
  earliestFirst: true,
  historyRange: 'This Month',
};

export type TaskResultSection = {
  /** `TaskResultSection.id` (TaskQuery.swift:4): the day and the done-ness together. */
  id: string;
  /** Start of the section's day, epoch ms, or `DISTANT_FUTURE` for unscheduled. */
  date: number;
  isDone: boolean;
  tasks: NexdoTask[];
};

export type TaskListSnapshot = {
  tasks: NexdoTask[];
  sections: TaskResultSection[];
  counts: Record<TaskDateFilter, number>;
};

/** `Date.distantFuture`, the sort key Swift gives an unscheduled task (TaskQuery.swift:97). */
export const DISTANT_FUTURE = 64092211200000;

type Interval = { start: number; end: number };

/** `task.isDone` (Models.swift:47). */
export function isDone(task: NexdoTask): boolean {
  return task.status === 'COMPLETED';
}

const YMD = new Map<string, Intl.DateTimeFormat>();

function ymdFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = YMD.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    YMD.set(timeZone, formatter);
  }
  return formatter;
}

/** The calendar day an instant falls on, in the account's zone, as `yyyy-mm-dd`. */
export function dayKey(at: number, timeZone: string): string {
  try {
    return ymdFormatter(timeZone).format(new Date(at));
  } catch {
    // An unknown zone identifier falls back to the device zone, as `TimeZone(identifier:) ?? .current`.
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  }
}

/** The zone's UTC offset in ms at a given instant. */
function zoneOffset(at: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at;
  } catch {
    return -new Date(at).getTimezoneOffset() * 60_000;
  }
}

/** Midnight at the start of the day containing `at`, in the account's zone, as epoch ms. */
export function startOfDay(at: number, timeZone: string): number {
  const [year, month, day] = dayKey(at, timeZone).split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  // The offset one hour into the day avoids reading a transition that lands exactly on midnight.
  const candidate = utcMidnight - zoneOffset(utcMidnight + 3_600_000, timeZone);
  // A day that starts by springing forward has no 00:00; the first real instant is the transition.
  return dayKey(candidate, timeZone) === dayKey(at, timeZone) ? candidate : candidate + 3_600_000;
}

/** Midnight `days` away from the day containing `at`. */
export function addDays(at: number, days: number, timeZone: string): number {
  const [year, month, day] = dayKey(at, timeZone).split('-').map(Number);
  // Noon keeps the arithmetic clear of both DST edges before the day is re-derived.
  return startOfDay(Date.UTC(year, month - 1, day + days, 12), timeZone);
}

/** The day interval containing `at`: `calendar.dateInterval(of: .day, for:)`. */
function dayInterval(at: number, timeZone: string): Interval {
  const start = startOfDay(at, timeZone);
  return { start, end: addDays(start, 1, timeZone) };
}

/**
 * The week interval containing `at`. Swift sets `firstWeekday = 2` (TaskQuery.swift:76), so weeks run
 * Monday to Sunday regardless of the device locale.
 */
function weekInterval(at: number, timeZone: string): Interval {
  const start = startOfDay(at, timeZone);
  const [year, month, day] = dayKey(start, timeZone).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  const backToMonday = (weekday + 6) % 7;
  const monday = addDays(start, -backToMonday, timeZone);
  return { start: monday, end: addDays(monday, 7, timeZone) };
}

/** The month interval containing `at`. */
function monthInterval(at: number, timeZone: string): Interval {
  const [year, month] = dayKey(at, timeZone).split('-').map(Number);
  const start = startOfDay(Date.UTC(year, month - 1, 1, 12), timeZone);
  const end = startOfDay(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 12), timeZone);
  return { start, end };
}

/** `TaskHistoryRange.interval(now:calendar:)` (TaskQuery.swift:29-41). */
export function historyInterval(range: TaskHistoryRange, now: number, timeZone: string): Interval {
  const today = startOfDay(now, timeZone);
  switch (range) {
    case 'Last 2 weeks':
      return { start: addDays(today, -13, timeZone), end: addDays(today, 1, timeZone) };
    case 'This Month':
      return monthInterval(now, timeZone);
    case 'Last Month': {
      const thisMonth = monthInterval(now, timeZone);
      return { start: monthInterval(thisMonth.start - 1, timeZone).start, end: thisMonth.start };
    }
  }
}

/**
 * `String.localizedStandardContains` — case- and diacritic-insensitive containment. `Intl.Collator`
 * with `sensitivity: 'base'` gives the same equivalence but has no substring form, so this folds both
 * sides and uses `includes`.
 */
export function standardContains(haystack: string, needle: string): boolean {
  return fold(haystack).includes(fold(needle));
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en-US');
}

/** ISO-8601 with or without fractional seconds, as Swift tries both formatters (TaskQuery.swift:88-90). */
export function parseServerDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

/**
 * `TaskQuery.snapshot` (TaskQuery.swift:71-127). One pass builds the counts for every pill and the
 * selected list; only the selected list is sorted and sectioned.
 */
export function snapshot(query: TaskQuery, tasks: NexdoTask[], timeZone: string, now: number = Date.now()): TaskListSnapshot {
  const tomorrow = addDays(startOfDay(now, timeZone), 1, timeZone);
  const intervals: Record<TaskDateFilter, Interval> = {
    All: historyInterval(query.historyRange, now, timeZone),
    Today: dayInterval(now, timeZone),
    Tomorrow: dayInterval(tomorrow, timeZone),
    'This Week': weekInterval(now, timeZone),
  };
  const term = query.search.trim();
  const counts: Record<TaskDateFilter, number> = { Today: 0, Tomorrow: 0, 'This Week': 0, All: 0 };
  const selected: { task: NexdoTask; date: number }[] = [];

  for (const task of tasks) {
    if (task.status === 'CANCELLED') continue;
    const done = isDone(task);
    if (!(query.status === 'All' || (query.status === 'Completed' ? done : !done))) continue;
    if (!(query.priority === 'All' || task.priority === query.priority)) continue;
    if (term.length > 0 && !standardContains(task.title, term) && !standardContains(task.notes ?? '', term)) continue;

    const scheduled = parseServerDate(task.startAt ?? task.dueAt) ?? DISTANT_FUTURE;
    for (const filter of TASK_DATE_FILTERS) {
      const interval = intervals[filter];
      const inHistory = scheduled >= interval.start && scheduled < interval.end;
      const upcomingOpen = filter === 'All' && query.historyRange !== 'This Month' && !done && scheduled >= tomorrow;
      if (!inHistory && !upcomingOpen) continue;
      counts[filter] += 1;
      if (filter === query.date) selected.push({ task, date: scheduled });
    }
  }

  selected.sort((lhs, rhs) => {
    const leftDone = isDone(lhs.task);
    const rightDone = isDone(rhs.task);
    // Open work first, whatever the date ordering.
    if (leftDone !== rightDone) return leftDone ? 1 : -1;
    if (lhs.date === rhs.date) return lhs.task.id < rhs.task.id ? -1 : lhs.task.id > rhs.task.id ? 1 : 0;
    if (query.date === 'All') {
      // History reads newest-first, but anything still ahead of you is listed before it, soonest first.
      const leftUpcoming = lhs.date >= tomorrow;
      const rightUpcoming = rhs.date >= tomorrow;
      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
      return leftUpcoming ? lhs.date - rhs.date : rhs.date - lhs.date;
    }
    return query.earliestFirst ? lhs.date - rhs.date : rhs.date - lhs.date;
  });

  const sections: TaskResultSection[] = [];
  let current: TaskResultSection | null = null;
  for (const item of selected) {
    const day = item.date === DISTANT_FUTURE ? DISTANT_FUTURE : startOfDay(item.date, timeZone);
    const done = isDone(item.task);
    if (!current || current.date !== day || current.isDone !== done) {
      current = { id: `${done}-${day}`, date: day, isDone: done, tasks: [] };
      sections.push(current);
    }
    current.tasks.push(item.task);
  }

  return { tasks: selected.map((item) => item.task), sections, counts };
}

/**
 * `TaskQuery.revealCreatedTask` (TaskQuery.swift:55-64): after a create, move the list to the day the
 * task landed on and drop the filters that would hide it.
 */
export function revealCreatedTask(query: TaskQuery, scheduledAt: number | null, timeZone: string, now: number = Date.now()): TaskQuery {
  const selected = scheduledAt ?? now;
  const selectedDay = dayKey(selected, timeZone);
  const tomorrow = addDays(startOfDay(now, timeZone), 1, timeZone);
  const date: TaskDateFilter =
    selectedDay === dayKey(now, timeZone) ? 'Today' : selectedDay === dayKey(tomorrow, timeZone) ? 'Tomorrow' : 'All';
  return { ...query, date, search: '', status: 'Open', priority: 'All' };
}
