import type { Prisma } from '@/generated/prisma';
import { addDays, formatTime, startOfLocalDay, tzToday, ymd } from './time';

export type TaskTimeline = 'ALL' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK';

export function taskTimelineRange(timeline: string | null, timeZone: string, now = new Date()) {
  const today = tzToday(timeZone, now);
  let from = today;
  let days = 1;
  if (timeline === 'TOMORROW') from = addDays(today, 1);
  else if (timeline === 'THIS_WEEK') {
    from = addDays(today, -((today.getUTCDay() + 6) % 7));
    days = 7;
  } else if (timeline !== 'TODAY') return null;
  // Local calendar boundaries, not a rolling 24 hours (important around DST).
  return { gte: startOfLocalDay(ymd(from), timeZone), lt: startOfLocalDay(ymd(addDays(from, days)), timeZone) };
}

export function taskTimelineCondition(timeline: string | null, timeZone: string, now = new Date()): Prisma.TaskWhereInput {
  const range = taskTimelineRange(timeline, timeZone, now);
  // A deadline wins over a scheduled start. Undated tasks remain available in All.
  return range ? { OR: [{ dueAt: range }, { dueAt: null, startAt: range }] } : {};
}

export function taskDueLabel(task: { dueAt: string | null; startAt: string | null }, timeZone: string, now = new Date()) {
  const at = task.dueAt ?? task.startAt;
  if (!at) return 'No date';
  const date = new Date(at);
  const isToday = ymd(tzToday(timeZone, date)) === ymd(tzToday(timeZone, now));
  const day = isToday ? '' : `${new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(date)}, `;
  return `${task.dueAt ? 'Due' : 'Scheduled'} ${day}${formatTime(date, timeZone)}`;
}
