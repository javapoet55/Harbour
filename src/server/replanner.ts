import { creationWarnings } from '@/lib/availability';
import { loadScheduleContext } from './schedule-intelligence';
import { protectedTaskIds } from '@/lib/protected-time';
import { normalizedBuffer } from '@/lib/availability';
import { prisma } from './db';
import { listEventsInRange } from './agenda';
import { buildReplan, type ReplanMove, type ReplanRisk } from '@/lib/replanning';
import { addDays, endOfLocalDay, formatDay, formatTime, tzToday, ymd } from '@/lib/time';
import { scheduleDefaultReminders } from './reminders';
import { pushTaskToExternal, syncConnection } from './calendar-sync';
import { personalizedTaskDurations } from './predictions';
import { createHash } from 'node:crypto';
import type { Prisma } from '@/generated/prisma';
import { inc } from '@/lib/metrics';
import { log } from '@/lib/logger';

const INTENT = 'CONTINUOUS_REPLAN';
const OPEN = ['INBOX', 'PLANNED', 'IN_PROGRESS'];

type ReplanPayload = {
  version: 1;
  kind: typeof INTENT;
  generatedAt: string;
  moves: ReplanMove[];
  risks: ReplanRisk[];
  contextVersion?: string;
  executive?: boolean;
};

/** Guards against added/deleted appointments, changed preferences and concurrent task edits. */
export async function scheduleContextVersion(userId: string, db: Prisma.TransactionClient = prisma) {
  const [tasks, events, connections, preference, memories, dependencies] = await Promise.all([
    db.task.findMany({ where: { userId }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    db.calendarEvent.findMany({ where: { userId }, select: { id: true, title: true, startAt: true, endAt: true, allDay: true, deletedAt: true, connectionId: true }, orderBy: { id: 'asc' } }),
    db.calendarConnection.findMany({ where: { userId }, select: { id: true, status: true, visible: true, writeEnabled: true, calendarId: true }, orderBy: { id: 'asc' } }),
    db.user.findUnique({ where: { id: userId }, select: { timeZone: true, preference: { select: { updatedAt: true } } } }),
    db.userMemory.findMany({ where: { userId, kind: { in: ['preference', 'protected_time'] } }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    db.taskDependency.findMany({ where: { task: { userId } }, select: { id: true, taskId: true, dependsOnId: true }, orderBy: { id: 'asc' } }),
  ]);
  return createHash('sha256').update(JSON.stringify({ tasks, events, connections, preference, memories, dependencies })).digest('hex');
}

export async function storeExecutiveProposal(userId: string, plan: { generatedAt: string; moves: ReplanMove[]; risks: ReplanRisk[] }, contextVersion: string) {
  const payload: ReplanPayload = { version: 1, kind: INTENT, ...plan, contextVersion, executive: true };
  const action = await prisma.$transaction(async (tx) => {
    await tx.assistantAction.updateMany({ where: { userId, intent: 'EXECUTIVE_REPLAN', executed: false }, data: { executed: true, confirmation: 'SUPERSEDED' } });
    // Stamped from the same clock as the EXECUTIVE_READ that follows it (executive-companion.ts:140).
    // A database default would come from the engine's own clock, which orders the pair by two different
    // clocks and can hide the read from `lastExecutiveTurn`.
    return plan.moves.length ? tx.assistantAction.create({ data: { userId, intent: 'EXECUTIVE_REPLAN', payloadJson: JSON.stringify(payload), confirmation: 'REQUIRED', createdAt: new Date() } }) : null;
  });
  if (!action) return null;
  inc('schedule_change_proposed');
  log('info', 'schedule_change_proposed', { moves: plan.moves.length, risks: plan.risks.length });
  return action.id;
}

export async function rejectReplanProposal(userId: string, actionId: string) {
  const result = await prisma.assistantAction.updateMany({ where: { id: actionId, userId, intent: { in: [INTENT, 'EXECUTIVE_REPLAN'] }, executed: false }, data: { executed: true, confirmation: 'REJECTED' } });
  if (result.count !== 1) throw new Error('NOT_FOUND');
  inc('schedule_change_rejected'); log('info', 'schedule_change_rejected');
}

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
  const bufferMemory = await prisma.userMemory.findUnique({ where: { userId_key: { userId, key: 'preference:buffer_minutes' } } });
  const protectedRecords = await prisma.userMemory.findMany({ where: { userId, kind: 'protected_time' } });
  const protectedIds = protectedTaskIds(protectedRecords, tasks, now);
  const plan = buildReplan({
    protectedTaskIds: protectedIds,
    tasks: tasks.map((task) => ({ ...task, durationMin: protectedIds.includes(task.id) ? task.durationMin : predictedDurations.get(task.id) ?? task.durationMin, dependsOnIds: task.dependencies.filter((dependency) => dependency.dependsOn.status !== 'COMPLETED').map((dependency) => dependency.dependsOnId) })),
    events: events.filter((event) => !event.externalId || !tasks.some((task) => task.externalEventId === event.externalId)),
    timeZone: user.timeZone,
    workingDays: preference?.workingDays ?? '1,2,3,4,5',
    workStart: preference?.workStart ?? '09:00', workEnd: preference?.workEnd ?? '17:00',
    horizonDays, now, bufferMinutes: normalizedBuffer(bufferMemory?.value),
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

export async function applyReplanProposal(userId: string, actionId: string, now = new Date()) {
  const preference = await prisma.userPreference.findUnique({ where: { userId } });
  const action = await prisma.assistantAction.findFirst({ where: { id: actionId, userId, intent: { in: [INTENT, 'EXECUTIVE_REPLAN'] }, executed: false } });
  if (!action) throw new Error('NOT_FOUND');
  const payload = JSON.parse(action.payloadJson) as ReplanPayload;
  if (payload.version !== 1 || payload.kind !== INTENT) throw new Error('INVALID_REPLAN');
  if (payload.executive) {
    const connections = await prisma.calendarConnection.findMany({ where: { userId, visible: true, provider: { in: ['google', 'microsoft'] } }, select: { id: true, status: true } });
    try {
      for (const connection of connections) {
        if (connection.status !== 'connected') throw new Error('CALENDAR_UNAVAILABLE');
        await syncConnection(userId, connection.id);
      }
    } catch { throw new Error('CALENDAR_UNAVAILABLE'); }
    now = new Date(); // Network time must count toward proposal expiry/start validation.
  }
  await prisma.$transaction(async (tx) => {
    if (payload.executive && (Math.abs(+now - +new Date(payload.generatedAt)) > 15 * 60_000 || !payload.contextVersion || await scheduleContextVersion(userId, tx) !== payload.contextVersion || payload.moves.some((move) => +new Date(move.toStartAt) < +now))) throw new Error('STALE_REPLAN');
    const protectedRecords = await tx.userMemory.findMany({ where: { userId, kind: 'protected_time' } });
    const protectedTasks = await tx.task.findMany({ where: { userId, deletedAt: null } });
    const protectedIds = protectedTaskIds(protectedRecords, protectedTasks, now);
    if (payload.moves.some(move => protectedIds.includes(move.taskId))) throw new Error('STALE_REPLAN');
    const horizon = Math.ceil((Math.max(+now, ...payload.moves.map(move => +new Date(move.toStartAt) + move.durationMin * 60000)) - +now) / 86400000) + 2;
    const schedule = await loadScheduleContext(userId, now, horizon, tx);
    const moving = new Set(payload.moves.map(move => move.taskId));
    schedule.tasks = schedule.tasks.map(task => moving.has(task.id) ? { ...task, startAt: null } : task);
    for (const move of payload.moves) {
      const start = new Date(move.toStartAt);
      if (+start < +now || creationWarnings(schedule, start, new Date(+start + move.durationMin * 60000), 'task', move.taskId).length) throw new Error('STALE_REPLAN');
      const task = schedule.tasks.find(task => task.id === move.taskId);
      if (!task) throw new Error('STALE_REPLAN');
      task.startAt = start; task.durationMin = move.durationMin;
    }
    const claimed = await tx.assistantAction.updateMany({ where: { id: action.id, userId, executed: false }, data: { executed: true, confirmation: 'CONFIRMED' } });
    if (claimed.count !== 1) throw new Error('STALE_REPLAN');
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
  if (payload.executive) { inc('schedule_change_accepted'); log('info', 'schedule_change_accepted', { moved: payload.moves.length }); }
  const external = await Promise.allSettled(payload.moves.map(async (move) => {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: move.taskId } });
    await scheduleDefaultReminders(userId, task.id, new Date(move.toStartAt), task.critical);
    return pushTaskToExternal(userId, task.id);
  }));
  return { moved: payload.moves.length, risks: payload.risks, externalSyncFailures: external.filter((result) => result.status === 'rejected').length };
}
