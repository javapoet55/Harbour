import { prisma } from './db';
import { listEventsInRange } from './agenda';
import { buildReplan, type ReplanMove, type ReplanRisk } from '@/lib/replanning';
import { addDays, endOfLocalDay, formatDay, formatTime, tzToday, ymd } from '@/lib/time';
import { scheduleDefaultReminders } from './reminders';
import { pushTaskToExternal } from './calendar-sync';
import { personalizedTaskDurations } from './predictions';

const INTENT = 'CONTINUOUS_REPLAN';
const OPEN = ['INBOX', 'PLANNED', 'IN_PROGRESS'];

type ReplanPayload = {
  version: 1;
  kind: typeof INTENT;
  generatedAt: string;
  moves: ReplanMove[];
  risks: ReplanRisk[];
};

function reasonLabel(reason: ReplanMove['reason']) {
  if (reason === 'unfinished') return 'unfinished at its previous time';
  if (reason === 'meeting_conflict') return 'a meeting now conflicts';
  if (reason === 'outside_work_hours') return 'outside working hours';
  if (reason === 'urgent_inserted') return 'urgent work needs time';
  return 'higher-priority work needs the original slot';
}

export async function generateReplanProposal(userId: string, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { preference: true } });
  const preference = user.preference;
  const horizonDays = 7;
  const start = now;
  const end = endOfLocalDay(ymd(addDays(tzToday(user.timeZone, now), horizonDays - 1)), user.timeZone);
  const [tasks, events] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId, deletedAt: null, status: { in: OPEN },
        OR: [{ startAt: { lte: end } }, { dueAt: { lte: end } }, { startAt: null }],
      },
      include: { dependencies: { select: { dependsOnId: true, dependsOn: { select: { status: true } } } } },
      orderBy: { updatedAt: 'asc' },
    }),
    listEventsInRange(userId, start, end),
  ]);
  const predictedDurations = await personalizedTaskDurations(userId, tasks);
  const plan = buildReplan({
    tasks: tasks.map((task) => ({ ...task, durationMin: predictedDurations.get(task.id) ?? task.durationMin, dependsOnIds: task.dependencies.filter((dependency) => dependency.dependsOn.status !== 'COMPLETED').map((dependency) => dependency.dependsOnId) })),
    events: events.filter((event) => !event.externalId || !tasks.some((task) => task.externalEventId === event.externalId)),
    timeZone: user.timeZone,
    workingDays: preference?.workingDays ?? '1,2,3,4,5',
    workStart: preference?.workStart ?? '09:00', workEnd: preference?.workEnd ?? '17:00',
    horizonDays, now,
  });
  const payload: ReplanPayload = { version: 1, kind: INTENT, generatedAt: plan.generatedAt, moves: plan.moves, risks: plan.risks };
  let actionId: string | null = null;
  if (plan.moves.length) {
    const pending = await prisma.assistantAction.findFirst({ where: { userId, intent: INTENT, executed: false }, orderBy: { createdAt: 'desc' } });
    const action = pending
      ? await prisma.assistantAction.update({ where: { id: pending.id }, data: { payloadJson: JSON.stringify(payload), confirmation: 'REQUIRED' } })
      : await prisma.assistantAction.create({ data: { userId, intent: INTENT, payloadJson: JSON.stringify(payload), confirmation: 'REQUIRED' } });
    actionId = action.id;
  } else {
    await prisma.assistantAction.updateMany({ where: { userId, intent: INTENT, executed: false }, data: { executed: true, confirmation: 'SUPERSEDED', resultJson: JSON.stringify({ moved: 0, risks: plan.risks }) } });
  }
  const spoken = plan.moves.length
    ? `I found ${plan.moves.length} schedule change${plan.moves.length === 1 ? '' : 's'} to keep your plan workable${plan.risks.length ? `, with ${plan.risks.length} capacity warning${plan.risks.length === 1 ? '' : 's'}` : ''}.`
    : plan.risks.length
      ? `Your existing blocks are stable, but ${plan.risks.length} task${plan.risks.length === 1 ? ' is' : 's are'} at risk.`
      : 'Your schedule is up to date. No work needs to move.';
  return {
    spoken, actionId, generatedAt: plan.generatedAt, kept: plan.kept,
    moves: plan.moves.map((move) => ({ ...move, fromLabel: move.fromStartAt ? `${formatDay(new Date(move.fromStartAt), user.timeZone)} at ${formatTime(new Date(move.fromStartAt), user.timeZone)}` : 'Unscheduled', toLabel: `${formatDay(new Date(move.toStartAt), user.timeZone)} at ${formatTime(new Date(move.toStartAt), user.timeZone)}`, reasonLabel: reasonLabel(move.reason) })),
    risks: plan.risks,
  };
}

export async function applyReplanProposal(userId: string, actionId: string) {
  const preference = await prisma.userPreference.findUnique({ where: { userId } });
  const action = await prisma.assistantAction.findFirst({ where: { id: actionId, userId, intent: INTENT, executed: false } });
  if (!action) throw new Error('NOT_FOUND');
  const payload = JSON.parse(action.payloadJson) as ReplanPayload;
  if (payload.version !== 1 || payload.kind !== INTENT) throw new Error('INVALID_REPLAN');
  await prisma.$transaction(async (tx) => {
    for (const move of payload.moves) {
      const updated = await tx.task.updateMany({
        where: { id: move.taskId, userId, deletedAt: null, status: { in: OPEN }, updatedAt: new Date(move.expectedUpdatedAt) },
        data: {
          startAt: new Date(move.toStartAt), durationMin: move.durationMin,
          postponeCount: preference?.personalizationEnabled && move.fromStartAt && new Date(move.toStartAt) > new Date(move.fromStartAt) ? { increment: 1 } : undefined,
          lastRescheduledAt: preference?.personalizationEnabled && move.fromStartAt && new Date(move.toStartAt) > new Date(move.fromStartAt) ? new Date() : undefined,
        },
      });
      if (updated.count !== 1) throw new Error('STALE_REPLAN');
      await tx.activityLog.create({ data: { userId, taskId: move.taskId, kind: 'AUTO_REPLAN', summary: `${move.fromStartAt || 'unscheduled'} -> ${move.toStartAt} (${move.reason})` } });
    }
    await tx.assistantAction.update({ where: { id: action.id }, data: { executed: true, confirmation: 'CONFIRMED', resultJson: JSON.stringify({ moved: payload.moves.length, risks: payload.risks }) } });
  });
  const external = await Promise.allSettled(payload.moves.map(async (move) => {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: move.taskId } });
    await scheduleDefaultReminders(userId, task.id, new Date(move.toStartAt), task.critical);
    return pushTaskToExternal(userId, task.id);
  }));
  return { moved: payload.moves.length, risks: payload.risks, externalSyncFailures: external.filter((result) => result.status === 'rejected').length };
}
