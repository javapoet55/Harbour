import { addDays, endOfLocalDay, formatTime, startOfLocalDay, tzToday, ymd } from '@/lib/time';
import { analyzeSchedule, withoutTaskMirrors } from '@/lib/schedule-intelligence';
import { listEventsInRange } from './agenda';
import { prisma } from './db';
import type { Prisma } from '@/generated/prisma';
import { buildPersonalizedInsights, personalizedTaskDurations } from './predictions';
import { activeFocusSchema } from '@/lib/focus-session';
import { NEXT_ACTION_POLICY } from '@/lib/next-action-config';

const OPEN = ['INBOX', 'PLANNED', 'IN_PROGRESS', 'WAITING'];

/** Shared request-scoped read model; never expose a User row/password hash to the model. */
export async function loadScheduleContext(userId: string, now = new Date(), days = 7, db: Prisma.TransactionClient = prisma) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, timeZone: true, preference: true } });
  const today = tzToday(user.timeZone, now);
  const from = startOfLocalDay(ymd(today), user.timeZone);
  const to = endOfLocalDay(ymd(addDays(today, days - 1)), user.timeZone);
  const [rows, imported, memories, connections, focusState] = await Promise.all([
    db.task.findMany({ where: { userId, OR: [
      { deletedAt: null, status: { in: OPEN } },
      { deletedAt: null, completedAt: { gte: from, lte: now } },
      { calendarEventId: { not: null } }, { externalEventId: { not: null } },
    ] }, include: {
      dependencies: { select: { dependsOnId: true, dependsOn: { select: { status: true, deletedAt: true } } } },
      dependents: { where: { task: { userId, deletedAt: null, status: { in: OPEN } } }, select: { id: true } },
    } }),
    listEventsInRange(userId, from, to, db),
    db.userMemory.findMany({ where: { userId, kind: 'preference' }, select: { key: true, value: true }, take: 50, orderBy: { updatedAt: 'desc' } }),
    db.calendarConnection.findMany({ where: { userId, visible: true, provider: { in: ['google', 'microsoft'] } }, select: { lastSyncedAt: true, status: true } }),
    db.userMemory.findUnique({ where: { userId_key: { userId, key: 'runtime:focus' } }, select: { value: true } }),
  ]);
  const durations = await personalizedTaskDurations(userId, rows, db);
  const linkedIds = rows.flatMap((task) => task.calendarEventId ? [task.calendarEventId] : []);
  const linked = linkedIds.length ? await db.calendarEvent.findMany({ where: { userId, id: { in: linkedIds } }, select: { id: true, startAt: true, endAt: true, deletedAt: true } }) : [];
  const byId = new Map(linked.map((event) => [event.id, event]));
  const drifted = new Set(rows.filter((task) => {
    if (!task.calendarEventId || !OPEN.includes(task.status) || task.deletedAt) return false;
    const event = byId.get(task.calendarEventId);
    return !event || event.deletedAt || !task.startAt || +event.startAt !== +task.startAt || +event.endAt !== +task.startAt + task.durationMin * 60000;
  }).map((task) => task.id));
  const memory = new Map(memories.map((item) => [item.key, item.value]));
  let activeFocus: { taskId: string; startedAt: number; endsAt: number } | null = null;
  try { const parsed = activeFocusSchema.safeParse(JSON.parse(focusState?.value ?? 'null')); if (parsed.success && parsed.data.startedAt <= +now && parsed.data.endsAt > +now && parsed.data.endsAt - parsed.data.startedAt <= 480 * 60000 && rows.some((task) => task.id === parsed.data.taskId && task.status === 'IN_PROGRESS' && !task.deletedAt)) activeFocus = parsed.data; } catch { /* Expired/invalid operational state is not evidence of focus. */ }
  const threshold = Number(memory.get('preference:switching_threshold') ?? NEXT_ACTION_POLICY.switchingThreshold);
  const requestedBuffer = Number(memory.get('preference:buffer_minutes') ?? 15);
  const bufferMinutes = Number.isFinite(requestedBuffer) ? Math.max(0, Math.min(120, requestedBuffer)) : 15;
  const preferredProject = memory.get('preference:focus_project_id') ?? memory.get('goal:project_id');
  const tasks = rows.map((task) => ({ ...task,
    calendarDurationMin: task.durationMin,
    status: task.deletedAt ? 'CANCELLED' : task.status,
    startAt: drifted.has(task.id) ? null : task.startAt,
    durationMin: durations.get(task.id) ?? task.durationMin,
    dependencyBlocked: drifted.has(task.id) || task.dependencies.some((edge) => edge.dependsOn.status !== 'COMPLETED' && !edge.dependsOn.deletedAt),
    dependsOnIds: task.dependencies.filter((edge) => edge.dependsOn.status !== 'COMPLETED' && !edge.dependsOn.deletedAt).map((edge) => edge.dependsOnId),
    blocksCount: task.dependents.length,
    preferenceScore: preferredProject && task.projectId === preferredProject ? 100 : 50,
    contextScore: memory.get('preference:energy') === task.energyLevel ? 100 : task.status === 'IN_PROGRESS' ? 85 : 50,
  }));
  const staleCalendars = connections.filter((connection) => connection.status !== 'connected' || !connection.lastSyncedAt || +now - +connection.lastSyncedAt > 15 * 60000).length;
  const calendarFreshUntil = connections.length ? Math.min(...connections.map((connection) => connection.lastSyncedAt ? +connection.lastSyncedAt + 15 * 60000 : +now)) : null;
  return { user, now, from, to, tasks, events: withoutTaskMirrors(imported, tasks), activeFocus, calendarFreshUntil,
    nextActionEnabled: memory.get('preference:next_action_enabled') === 'true',
    switchingThreshold: Number.isFinite(threshold) ? Math.max(0, Math.min(50, threshold)) : NEXT_ACTION_POLICY.switchingThreshold,
    contextWarnings: [...(staleCalendars ? [`${staleCalendars} connected calendar(s) have stale or unavailable sync data. Synchronize before relying on this schedule.`] : []), ...(drifted.size ? [`${drifted.size} task calendar link(s) changed outside Nexdo. Their current calendar blocks are protected; review the linked tasks before scheduling them.`] : [])],
    timeZone: user.timeZone, workingDays: user.preference?.workingDays ?? '1,2,3,4,5',
    workStart: user.preference?.workStart ?? '09:00', workEnd: user.preference?.workEnd ?? '17:00', bufferMinutes,
  };
}

export type ScheduleContext = Awaited<ReturnType<typeof loadScheduleContext>>;

/** One read-model over existing tasks and calendar events; no separate schedule data is stored. */
export async function getScheduleIntelligence(userId: string, now = new Date(), options: { scope?: 'today'; bufferMinutes?: number } = {}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { preference: true } });
  const today = tzToday(user.timeZone, now);
  const end = endOfLocalDay(ymd(addDays(today, options.scope === 'today' ? 0 : 4)), user.timeZone);
  const [events, tasks, insights] = await Promise.all([
    listEventsInRange(userId, startOfLocalDay(ymd(today), user.timeZone), end),
    prisma.task.findMany({
      where: { userId, OR: [
        { deletedAt: null, status: { in: OPEN }, OR: [{ dueAt: { lte: end } }, { startAt: { lte: end } }, { startAt: null }] },
        { calendarEventId: { not: null } }, { externalEventId: { not: null } },
      ] },
      include: { dependencies: { select: { dependsOn: { select: { status: true, deletedAt: true } } } }, dependents: { where: { task: { deletedAt: null, status: { in: OPEN } } }, select: { id: true } } },
    }),
    user.preference?.personalizationEnabled ? buildPersonalizedInsights(userId, now) : Promise.resolve(null),
  ]);
  const preferenceById = new Map(insights?.enabled ? insights.completion.predictions.map((item) => [item.taskId, item.probability]) : []);
  const result = analyzeSchedule({
    events,
    tasks: tasks.map((task) => ({ ...task, status: task.deletedAt ? 'CANCELLED' : task.status, dependencyBlocked: task.dependencies.some((edge) => edge.dependsOn.status !== 'COMPLETED' && !edge.dependsOn.deletedAt), blocksCount: task.dependents.length, preferenceScore: preferenceById.get(task.id) })),
    timeZone: user.timeZone,
    workStart: user.preference?.workStart ?? '09:00',
    workEnd: user.preference?.workEnd ?? '17:00',
    workingDays: user.preference?.workingDays ?? '1,2,3,4,5',
    bufferMinutes: options.bufferMinutes,
    now,
  });
  return { ...result, timeZone: user.timeZone, generatedAt: now.toISOString() };
}

/** The Today page and its conversational shortcut use the same facts. */
export async function buildTodayBriefing(userId: string) {
  const { today } = await getScheduleIntelligence(userId, new Date(), { scope: 'today' });
  const summary = `You have ${today.commitments} commitment${today.commitments === 1 ? '' : 's'} today: ${today.appointments} calendar appointments and ${today.tasks} open tasks. ${today.attention.length ? `${today.attention.length} thing${today.attention.length === 1 ? ' needs' : 's need'} your attention.` : 'No conflicts detected.'}`;
  const line = (item: typeof today.timeline[number]) => `${item.allDay ? 'All day' : `${item.deadlineOnly ? 'Due ' : ''}${formatTime(new Date(item.startAt), today.timeZone)}`} — ${item.title}`;
  const sections = [
    { title: 'Today at a glance', items: [`${today.appointments} calendar appointments · ${today.tasks} open tasks`, `${today.availableMinutes} free minutes within your remaining working hours`] },
    { title: 'Your commitments', items: today.timeline.length ? today.timeline.map(line) : ['Nothing scheduled today.'] },
    { title: 'Needs attention', items: today.attention.length ? today.attention.map((item) => `${item.label}: ${item.explanation}`) : ['No conflicts detected.'] },
    { title: 'Recommended next step', items: [today.recommendation.title, today.recommendation.explanation, ...(today.recommendation.additionalAdvice ? [today.recommendation.additionalAdvice] : [])] },
  ];
  return { spoken: `${summary}\n\n${sections.map((section) => `${section.title}: ${section.items.join(' ')}`).join('\n\n')}`, visual: { summary, appointments: today.timeline.filter((item) => item.kind === 'event').map(line), tasks: today.timeline.filter((item) => item.kind === 'task').map(line), overdue: today.attention.filter((item) => item.label === 'Overdue').map((item) => item.explanation), next: today.recommendation.explanation, rangeLabel: 'Today’s snapshot', sections } };
}
