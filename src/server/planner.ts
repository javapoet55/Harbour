import { listEventsInRange, listTasksInRange } from './agenda';
import { endOfLocalDay, startOfLocalDay, tzToday, addDays, ymd } from '@/lib/time';
import { prisma } from './db';
import { personalizedTaskDurations } from './predictions';
import { rankFocusTasks } from '@/lib/focus-ranking';
import { calendarBusy, freeSlots, minutesIn, withoutTaskMirrors } from '@/lib/schedule-intelligence';
import { workWindows } from '@/lib/replanning';

export async function buildDailyPlan(userId: string, timeZone: string, ymdValue: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { preference: true },
  });
  const start = startOfLocalDay(ymdValue, timeZone);
  const end = endOfLocalDay(ymdValue, timeZone);
  const [tasks, events] = await Promise.all([
    listTasksInRange(userId, start, end),
    listEventsInRange(userId, start, end),
  ]);
  const predictedDurations = await personalizedTaskDurations(userId, tasks);
  const minutesFor = (task: typeof tasks[number]) => predictedDurations.get(task.id) ?? task.durationMin ?? 30;
  const workStart = user.preference?.workStart ?? '09:00';
  const workEnd = user.preference?.workEnd ?? '17:00';
  const memory = await prisma.userMemory.findUnique({ where: { userId_key: { userId, key: 'preference:buffer_minutes' } } });
  const configuredBuffer = Number(memory?.value ?? 15);
  const buffer = Number.isFinite(configuredBuffer) ? Math.max(0, Math.min(120, configuredBuffer)) : 15;
  const now = new Date();
  const windows = workWindows(timeZone, user.preference?.workingDays ?? '1,2,3,4,5', workStart, workEnd, 1, start);
  const available = minutesIn(windows.flatMap((window) => freeSlots(Math.max(+now, window.start), window.end, calendarBusy(withoutTaskMirrors(events, tasks), buffer))));
  const openTasks = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const needed = openTasks.reduce((sum, task) => sum + minutesFor(task), 0);
  const rankedIds = rankFocusTasks(openTasks.map((task) => ({ id: task.id, title: task.title, priority: task.priority, status: task.status, dueAt: task.dueAt, startAt: task.startAt, postponeCount: task.postponeCount, dependencyBlocked: task.dependencies.some((edge) => edge.dependsOn.status !== 'COMPLETED') }))).map((task) => task.id);
  const ranked = [...openTasks].sort((a, b) => rankedIds.indexOf(a.id) - rankedIds.indexOf(b.id));
  const keep: typeof ranked = [];
  const move: typeof ranked = [];
  let used = 0;
  for (const task of ranked) {
    const predictedMinutes = minutesFor(task);
    if (task.status !== 'WAITING' && !task.dependencies.some((edge) => edge.dependsOn.status !== 'COMPLETED') && used + predictedMinutes <= available) {
      keep.push(task);
      used += predictedMinutes;
    } else {
      move.push(task);
    }
  }
  const dayLabel = ymdValue === ymd(addDays(tzToday(timeZone, now), 1)) ? 'tomorrow' : `on ${ymdValue}`;
  const spoken = openTasks.length === 0
    ? `You have ${available} available working minutes ${dayLabel} and no open tasks.`
    : `You have ${openTasks.length} tasks needing ${needed} minutes, and ${available} available working minutes ${dayLabel}. ${keep.length ? `Start with ${keep.map((t) => t.title).slice(0, 3).join(', ')}.` : 'No actionable task fits safely in the available capacity.'}${move.length ? ` Review ${move.length} blocked or remaining task${move.length === 1 ? '' : 's'}.` : ''} This is a capacity estimate, not a reserved schedule. I have not changed your calendar.`;

  return {
    spoken,
    visual: {
      summary: spoken,
      appointments: events.map((e) => e.title),
      tasks: keep.map((task) => `${task.title} (${minutesFor(task)}m${minutesFor(task) !== task.durationMin ? ', personalized estimate' : ''})`),
      overdue: move.map((t) => `Consider moving: ${t.title}`),
      next: 'Ask me to fix your afternoon to review specific changes before approving them.',
      rangeLabel: `Plan for ${ymdValue}`,
    },
    availableMinutes: available,
    neededMinutes: needed,
    keepIds: keep.map((t) => t.id),
    moveIds: move.map((t) => t.id),
  };
}
