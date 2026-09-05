import { listEventsInRange, listTasksInRange } from './agenda';
import { endOfLocalDay, startOfLocalDay } from '@/lib/time';
import { prisma } from './db';
import { personalizedTaskDurations } from './predictions';
import { rankFocusTasks } from '@/lib/focus-ranking';

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
  const [wsH, wsM] = workStart.split(':').map(Number);
  const [weH, weM] = workEnd.split(':').map(Number);
  const workMinutes = weH * 60 + weM - (wsH * 60 + wsM);
  const meetingMinutes = events.reduce((sum, event) => sum + Math.max(0, (event.endAt.getTime() - event.startAt.getTime()) / 60000), 0);
  const available = Math.max(0, workMinutes - meetingMinutes);
  const openTasks = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const needed = openTasks.reduce((sum, task) => sum + minutesFor(task), 0);
  const rankedIds = rankFocusTasks(openTasks.map((task) => ({ id: task.id, title: task.title, priority: task.priority, status: task.status, dueAt: task.dueAt, startAt: task.startAt, postponeCount: task.postponeCount, dependencyBlocked: task.dependencies.some((edge) => edge.dependsOn.status !== 'COMPLETED') }))).map((task) => task.id);
  const ranked = [...openTasks].sort((a, b) => rankedIds.indexOf(a.id) - rankedIds.indexOf(b.id));
  const keep: typeof ranked = [];
  const move: typeof ranked = [];
  let used = 0;
  for (const task of ranked) {
    const predictedMinutes = minutesFor(task);
    if (used + predictedMinutes <= available) {
      keep.push(task);
      used += predictedMinutes;
    } else {
      move.push(task);
    }
  }
  const spoken = openTasks.length === 0
    ? `Tomorrow looks clear. You have ${Math.round(available / 60)} available hours and no open tasks.`
    : `You have ${openTasks.length} tasks needing about ${Math.round(needed / 60)} hours, and ${Math.round(available / 60)} available hours tomorrow. I recommend completing ${keep.map((t) => t.title).slice(0, 3).join(', ') || 'your highest-priority work'}${move.length ? ` and moving ${move.length} lower-priority task${move.length === 1 ? '' : 's'}` : ''}. I have not changed your calendar.`;

  return {
    spoken,
    visual: {
      summary: spoken,
      appointments: events.map((e) => e.title),
      tasks: keep.map((task) => `${task.title} (${minutesFor(task)}m${minutesFor(task) !== task.durationMin ? ', personalized estimate' : ''})`),
      overdue: move.map((t) => `Consider moving: ${t.title}`),
      next: 'Approve the plan if you want me to place these blocks on your calendar.',
      rangeLabel: `Plan for ${ymdValue}`,
    },
    availableMinutes: available,
    neededMinutes: needed,
    keepIds: keep.map((t) => t.id),
    moveIds: move.map((t) => t.id),
  };
}
