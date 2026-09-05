import { prisma } from './db';
import { listEventsInRange, overdueTasks } from './agenda';
import { buildPersonalizedInsights, personalizedTaskDurations } from './predictions';
import { rankFocusTasks } from '@/lib/focus-ranking';
import { buildReplan } from '@/lib/replanning';
import { addDays, endOfLocalDay, formatDay, formatTime, startOfLocalDay, tzToday, ymd } from '@/lib/time';

const OPEN = ['INBOX', 'PLANNED', 'IN_PROGRESS'];
const localDay = (date: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export async function buildCompleteBriefing(userId: string, days = 7, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { preference: true } });
  const today = tzToday(user.timeZone, now);
  const todayKey = ymd(today);
  const tomorrowKey = ymd(addDays(today, 1));
  const end = endOfLocalDay(ymd(addDays(today, Math.max(1, days) - 1)), user.timeZone);
  const [tasks, events, overdue, insights] = await Promise.all([
    prisma.task.findMany({
      where: { userId, deletedAt: null, status: { in: OPEN }, OR: [{ dueAt: { lte: end } }, { startAt: { lte: end } }, { startAt: null, dueAt: null }] },
      include: { dependencies: { select: { dependsOnId: true, dependsOn: { select: { status: true } } } } },
      orderBy: [{ dueAt: 'asc' }, { startAt: 'asc' }],
    }),
    listEventsInRange(userId, startOfLocalDay(todayKey, user.timeZone), end),
    overdueTasks(userId, user.timeZone, now),
    user.preference?.personalizationEnabled ? buildPersonalizedInsights(userId, now) : Promise.resolve(null),
  ]);
  const predictedDurations = await personalizedTaskDurations(userId, tasks);
  const completion = new Map(insights?.enabled ? insights.completion.predictions.map((item) => [item.taskId, item.probability]) : []);
  const replan = buildReplan({
    tasks: tasks.map((task) => ({ ...task, durationMin: predictedDurations.get(task.id) ?? task.durationMin, dependsOnIds: task.dependencies.filter((edge) => edge.dependsOn.status !== 'COMPLETED').map((edge) => edge.dependsOnId) })),
    events, timeZone: user.timeZone, workingDays: user.preference?.workingDays ?? '1,2,3,4,5', workStart: user.preference?.workStart ?? '09:00', workEnd: user.preference?.workEnd ?? '17:00', horizonDays: days, now,
  });
  const conflictIds = new Set(replan.moves.filter((move) => move.reason === 'meeting_conflict').map((move) => move.taskId));
  const candidates = tasks.filter((task) => !task.dueAt || task.dueAt <= end || Boolean(task.startAt && task.startAt <= end));
  const ranked = rankFocusTasks(candidates.map((task) => ({ id: task.id, title: task.title, priority: task.priority, status: task.status, dueAt: task.dueAt, startAt: task.startAt, postponeCount: task.postponeCount, dependencyBlocked: task.dependencies.some((edge) => edge.dependsOn.status !== 'COMPLETED'), calendarConflict: conflictIds.has(task.id), completionProbability: completion.get(task.id) })), now);
  const top3 = ranked.filter((task) => !task.dependencyBlocked).slice(0, 3);
  const isOn = (task: typeof tasks[number], day: string) => Boolean((task.startAt && localDay(task.startAt, user.timeZone) === day) || (task.dueAt && localDay(task.dueAt, user.timeZone) === day));
  const todayTasks = tasks.filter((task) => isOn(task, todayKey));
  const tomorrowTasks = tasks.filter((task) => isOn(task, tomorrowKey));
  const todayEvents = events.filter((event) => localDay(event.startAt, user.timeZone) === todayKey);
  const tomorrowEvents = events.filter((event) => localDay(event.startAt, user.timeZone) === tomorrowKey);
  const deadlines = tasks.filter((task) => task.dueAt && task.dueAt >= now && task.dueAt <= end).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
  const conflicts = replan.moves.filter((move) => move.reason === 'meeting_conflict');
  const risks = replan.risks;
  const topText = top3.length ? top3.map((task, index) => `${index + 1}. ${task.title}, because ${task.reasons.slice(0, 2).join(' and ')}`).join('; ') : 'none';
  const deadlineText = deadlines.length ? deadlines.slice(0, 4).map((task) => `${task.title}, ${formatDay(task.dueAt!, user.timeZone)} at ${formatTime(task.dueAt!, user.timeZone)}`).join('; ') : 'none in this period';
  const conflictText = conflicts.length || risks.length ? `${conflicts.length} calendar conflict${conflicts.length === 1 ? '' : 's'} and ${risks.length} capacity or deadline risk${risks.length === 1 ? '' : 's'}` : 'none detected';
  const spoken = `Here is your complete ${days}-day briefing. Today: ${todayEvents.length} appointment${todayEvents.length === 1 ? '' : 's'} and ${todayTasks.length} task${todayTasks.length === 1 ? '' : 's'}. Tomorrow: ${tomorrowEvents.length} appointment${tomorrowEvents.length === 1 ? '' : 's'} and ${tomorrowTasks.length} task${tomorrowTasks.length === 1 ? '' : 's'}. Across the next ${days} days: ${events.length} appointments and ${tasks.length} open tasks. Upcoming deadlines: ${deadlineText}. Overdue: ${overdue.length ? overdue.map((task) => task.title).slice(0, 4).join(', ') : 'none'}. Schedule conflicts: ${conflictText}. Your Top 3 focus items are ${topText}.`;
  return {
    spoken,
    visual: {
      summary: spoken,
      appointments: [...todayEvents, ...tomorrowEvents].map((event) => `${formatDay(event.startAt, user.timeZone)}: ${event.title} at ${formatTime(event.startAt, user.timeZone)}`),
      tasks: top3.map((task, index) => `${index + 1}. ${task.title} — ${task.reasons.join(', ')}`),
      overdue: overdue.map((task) => task.title),
      next: `Deadlines: ${deadlineText}. Conflicts: ${conflictText}.`,
      rangeLabel: `Complete ${days}-day briefing`,
    },
    deadlines: deadlines.map((task) => task.id), deadlineLines: deadlines.map((task) => `${task.title}, ${formatDay(task.dueAt!, user.timeZone)} at ${formatTime(task.dueAt!, user.timeZone)}`),
    conflicts: conflicts.map((move) => move.taskId), conflictSummary: conflictText, risks, top3,
  };
}
