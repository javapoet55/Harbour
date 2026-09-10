import { prisma } from './db';
import { addDays, parseYmd, startOfLocalDay, tzToday, ymd } from '@/lib/time';

const priorityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, NORMAL: 1, LOW: 0 };

function localDay(value: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function startOfAccountWeek(timeZone: string, now = new Date()) {
  const today = tzToday(timeZone, now);
  const weekday = today.getUTCDay();
  return ymd(addDays(today, weekday === 0 ? -6 : 1 - weekday));
}

export function mondayForWeek(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('INVALID_WEEK');
  const date = parseYmd(day);
  if (Number.isNaN(+date) || ymd(date) !== day) throw new Error('INVALID_WEEK');
  const weekday = date.getUTCDay();
  return ymd(addDays(date, weekday === 0 ? -6 : 1 - weekday));
}

export function weeklySummaryTaskWhere(userId: string, start: Date, endExclusive: Date) {
  return {
    userId, deletedAt: null,
    OR: [
      { startAt: { gte: start, lt: endExclusive } },
      { startAt: null, dueAt: { gte: start, lt: endExclusive } },
    ],
  };
}

export function completionRate(completed: number, planned: number) {
  return planned === 0 ? null : Math.round((completed / planned) * 100);
}

export async function buildWeeklySummary(userId: string, timeZone: string, startDay: string, now = new Date()) {
  startDay = mondayForWeek(startDay);
  const startDate = parseYmd(startDay);
  const currentWeek = startOfAccountWeek(timeZone, now);
  if (startDay > currentWeek) throw new Error('FUTURE_WEEK');
  const days = Array.from({ length: 7 }, (_, index) => ymd(addDays(startDate, index)));
  const start = startOfLocalDay(startDay, timeZone);
  const endExclusive = startOfLocalDay(ymd(addDays(startDate, 7)), timeZone);
  const effectiveEnd = new Date(Math.min(endExclusive.getTime(), now.getTime()));

  const [tasks, sessions] = await Promise.all([
    prisma.task.findMany({
      where: weeklySummaryTaskWhere(userId, start, endExclusive),
      select: {
        id: true, title: true, priority: true, status: true, durationMin: true,
        notes: true, startAt: true, dueAt: true, completedAt: true, projectId: true,
        energyLevel: true, splittable: true, critical: true, minFocusMin: true,
        timeZone: true, subtasks: true, recurrence: true,
      },
      orderBy: [{ startAt: 'asc' }, { dueAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.taskWorkSession.findMany({
      where: { userId, startedAt: { lt: effectiveEnd }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] },
      select: { startedAt: true, endedAt: true },
    }),
  ]);

  const plannedByDay = Object.fromEntries(days.map((day) => [day, 0]));
  const completedByDay = Object.fromEntries(days.map((day) => [day, 0]));
  for (const task of tasks) {
    const anchor = task.startAt ?? task.dueAt;
    if (anchor) plannedByDay[localDay(anchor, timeZone)] = (plannedByDay[localDay(anchor, timeZone)] ?? 0) + 1;
    if (task.completedAt && task.completedAt >= start && task.completedAt < effectiveEnd) {
      const day = localDay(task.completedAt, timeZone);
      if (day in completedByDay) completedByDay[day] += 1;
    }
  }
  const completedTasks = tasks.filter((task) => task.completedAt && task.completedAt >= start && task.completedAt < effectiveEnd);
  const completed = completedTasks.length;
  const planned = tasks.length;
  const overdueTasks = tasks.filter((task) => task.dueAt && task.dueAt < effectiveEnd && (!task.completedAt || task.completedAt > effectiveEnd));
  const overdue = overdueTasks.length;
  const focusMinutes = sessions.reduce((total, session) => {
    const from = Math.max(session.startedAt.getTime(), start.getTime());
    const to = Math.min((session.endedAt ?? effectiveEnd).getTime(), effectiveEnd.getTime());
    return total + Math.max(0, Math.round((to - from) / 60_000));
  }, 0);
  const accomplishments = [...completedTasks].sort((a, b) => (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0) || +a.completedAt! - +b.completedAt! || a.id.localeCompare(b.id)).slice(0, 3);
  const percentage = completionRate(completed, planned);
  const firstName = (await prisma.user.findFirst({ where: { id: userId }, select: { name: true } }))?.name.split(/\s+/)[0] || 'there';
  const headline = planned === 0 ? `A clear week, ${firstName}` : completed === planned ? `Everything planned is complete, ${firstName}` : completed === 0 ? `A week in progress, ${firstName}` : `You completed ${completed} planned task${completed === 1 ? '' : 's'}, ${firstName}`;
  const summary = planned === 0 ? 'No tasks were scheduled for this week.' : `${planned - completed} of ${planned} planned task${planned === 1 ? '' : 's'} remain${planned - completed === 1 ? 's' : ''}. ${focusMinutes > 0 ? `${focusMinutes} minutes of focus time were recorded.` : 'No focus time was recorded.'}`;

  return {
    timeZone, start: startDay, end: days[6], generatedAt: now.toISOString(), headline, summary,
    metrics: { completed, planned, completionRate: percentage, overdue, focusMinutes },
    // Return the very same snapshot used by the counts; clients must not filter
    // a separate, possibly stale task cache to reconstruct historical results.
    taskGroups: { planned: tasks, completed: completedTasks, overdue: overdueTasks },
    days: days.map((day) => ({ date: day, planned: plannedByDay[day], completed: completedByDay[day] })),
    accomplishments: accomplishments.map(({ id, title, priority }) => ({ id, title, priority })),
    // Session records do not yet preserve enough comparable hourly buckets to make a reliable "most productive" claim.
    productivityInsight: null,
    limitations: ['Planned counts use each task’s scheduled start, or its due date when no start exists.', 'Deleted tasks and planning changes made after the week cannot be reconstructed.'],
  };
}
