import type { Prisma } from '@/generated/prisma';
import { prisma } from './db';
import { validateProjectAssignment } from './projects';
import { zonedDateTime } from '@/lib/time';
import { nextOccurrence } from '@/lib/recurrence';

function localYmd(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function createTask(input: {
  userId: string;
  title: string;
  notes?: string;
  kind?: string;
  status?: string;
  priority?: string;
  startAt?: Date | null;
  dueAt?: Date | null;
  durationMin?: number;
  energyLevel?: string;
  waitingOn?: string | null;
  critical?: boolean;
  listId?: string | null;
  idempotencyKey?: string;
  projectId?: string | null;
}) {
  if (!input.title.trim() || input.title.length > 200 || (input.durationMin !== undefined && (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin > 1440))) throw new Error('INVALID_TASK');
  if ([input.startAt, input.dueAt].some((date) => date && !Number.isFinite(+date))) throw new Error('INVALID_TASK');
  if (input.idempotencyKey) {
    const existing = await prisma.task.findFirst({ where: { idempotencyKey: input.idempotencyKey, userId: input.userId } });
    if (existing) return existing;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { timeZone: true } });
  return prisma.$transaction(async tx => {
    await validateProjectAssignment(tx, input.userId, input.projectId ?? null);
    return tx.task.create({
      data: {
        userId: input.userId,
        timeZone: user.timeZone,
        title: input.title.trim(),
        notes: input.notes ?? '',
        kind: input.kind ?? 'TASK',
        status: input.status ?? 'PLANNED',
        priority: input.priority ?? 'NORMAL',
        startAt: input.startAt ?? null,
        dueAt: input.dueAt ?? input.startAt ?? null,
        durationMin: input.durationMin ?? 30,
        energyLevel: input.energyLevel ?? 'MEDIUM',
        waitingOn: input.waitingOn ?? null,
        critical: input.critical ?? false,
        listId: input.listId ?? null,
        projectId: input.projectId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
}

export async function updateTask(userId: string, id: string, data: Prisma.TaskUpdateInput) {
  return prisma.$transaction(async tx => {
    const existing = await tx.task.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) throw new Error('NOT_FOUND');
    if (data.project?.connect?.id) await validateProjectAssignment(tx, userId, data.project.connect.id);
    return tx.task.update({ where: { id }, data });
  });
}

export async function completeTask(userId: string, id: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null }, include: { user: { include: { preference: true } }, workSessions: true, recurrence: true, dependencies: true } });
    if (!task) throw new Error('NOT_FOUND');
    let actualDurationMin = task.actualDurationMin;
    if (task.user.preference?.personalizationEnabled) {
      const active = task.workSessions.filter((session) => !session.endedAt);
      for (const session of active) {
        const durationMin = Math.max(1, Math.round((now.getTime() - session.startedAt.getTime()) / 60_000));
        await tx.taskWorkSession.update({ where: { id: session.id }, data: { endedAt: now, durationMin } });
      }
      actualDurationMin = task.workSessions.reduce((sum, session) => sum + (session.durationMin ?? (session.endedAt ? Math.max(1, Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000)) : Math.max(1, Math.round((now.getTime() - session.startedAt.getTime()) / 60_000)))), 0) || null;
    }
    const completed = await tx.task.update({ where: { id }, data: { status: 'COMPLETED', completedAt: now, actualDurationMin } });
    if (task.recurrence && task.startAt && (!task.recurrence.count || task.recurrence.count > 1)) {
      const byWeekday = task.recurrence.byWeekday?.split(',').map(Number).filter(Number.isInteger);
      const nextYmd = nextOccurrence(localYmd(task.startAt, task.timeZone), { frequency: task.recurrence.frequency.toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'yearly', interval: task.recurrence.interval, byWeekday });
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: task.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(task.startAt);
      const hm = `${parts.find((part) => part.type === 'hour')?.value}:${parts.find((part) => part.type === 'minute')?.value}`;
      const nextStart = zonedDateTime(nextYmd, hm, task.timeZone);
      if (!task.recurrence.until || nextStart <= task.recurrence.until) {
        const dueOffset = task.dueAt ? task.dueAt.getTime() - task.startAt.getTime() : 0;
        await tx.task.create({ data: {
          userId, listId: task.listId, projectId: task.projectId, categoryId: task.categoryId, title: task.title, notes: task.notes, kind: task.kind,
          status: 'PLANNED', priority: task.priority, startAt: nextStart, dueAt: task.dueAt ? new Date(nextStart.getTime() + dueOffset) : null,
          durationMin: task.durationMin, energyLevel: task.energyLevel, timeZone: task.timeZone, notifyPush: task.notifyPush, notifyEmail: task.notifyEmail,
          splittable: task.splittable, minFocusMin: task.minFocusMin,
          notifySms: task.notifySms, critical: task.critical, dependencies: { create: task.dependencies.map((dependency) => ({ dependsOnId: dependency.dependsOnId })) },
          recurrence: { create: { frequency: task.recurrence.frequency, interval: task.recurrence.interval, byWeekday: task.recurrence.byWeekday, until: task.recurrence.until, count: task.recurrence.count ? task.recurrence.count - 1 : null } },
        } });
      }
    }
    return completed;
  });
}

export async function startTask(userId: string, id: string, now = new Date(), db?: Prisma.TransactionClient) {
  const start = async (tx: Prisma.TransactionClient) => {
    const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null }, include: { user: { include: { preference: true } }, workSessions: { where: { endedAt: null } } } });
    if (!task) throw new Error('NOT_FOUND');
    if (task.user.preference?.personalizationEnabled && task.workSessions.length === 0) {
      await tx.taskWorkSession.create({ data: { userId, taskId: id, startedAt: now } });
    }
    return tx.task.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: task.user.preference?.personalizationEnabled ? (task.startedAt ?? now) : task.startedAt } });
  };
  return db ? start(db) : prisma.$transaction(start);
}

/** Close only the caller's captured work segment; retries cannot change recorded time. */
export async function finishFocusWork(userId: string, taskId: string, sessionId: string, endedAt: Date, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.taskWorkSession.findFirst({ where: { id: sessionId, userId, taskId } });
    if (!session) throw new Error('NOT_FOUND');
    if (session.endedAt) return session;
    const end = new Date(Math.max(session.startedAt.getTime(), Math.min(now.getTime(), endedAt.getTime())));
    await tx.taskWorkSession.updateMany({ where: { id: sessionId, userId, endedAt: null }, data: { endedAt: end, durationMin: Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 60_000)) } });
    return tx.taskWorkSession.findUniqueOrThrow({ where: { id: sessionId } });
  });
}

export async function deleteTask(userId: string, id: string) {
  return updateTask(userId, id, { deletedAt: new Date(), status: 'CANCELLED' });
}

export async function scheduleTask(userId: string, id: string, startAt: Date, durationMin?: number) {
  const duration = durationMin ?? 30;
  if (!Number.isFinite(+startAt) || !Number.isInteger(duration) || duration < 1 || duration > 1440) throw new Error('INVALID_TASK');
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null }, include: { user: { include: { preference: true } } } });
    if (!task) throw new Error('NOT_FOUND');
    const postponed = Boolean(task.user.preference?.personalizationEnabled && task.startAt && startAt.getTime() > task.startAt.getTime());
    const startAndDueCoupled = task.dueAt == null || (task.startAt != null && task.dueAt.getTime() === task.startAt.getTime());
    const shiftedDueAt = startAndDueCoupled ? new Date(startAt.getTime() + duration * 60_000) : task.dueAt;
    return tx.task.update({ where: { id }, data: {
      startAt,
      dueAt: shiftedDueAt,
      durationMin: duration,
      status: 'PLANNED',
      postponeCount: postponed ? { increment: 1 } : undefined,
      lastRescheduledAt: postponed ? new Date() : undefined,
    } });
  });
}

export function localWhen(ymdValue: string, hm: string | undefined, timeZone: string) {
  return zonedDateTime(ymdValue, hm || '09:00', timeZone);
}
