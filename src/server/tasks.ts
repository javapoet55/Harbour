import type { Prisma } from '@/generated/prisma';
import { prisma } from './db';
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
}) {
  if (input.idempotencyKey) {
    const existing = await prisma.task.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
  }
  return prisma.task.create({
    data: {
      userId: input.userId,
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
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function updateTask(userId: string, id: string, data: Prisma.TaskUpdateInput) {
  const existing = await prisma.task.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw new Error('NOT_FOUND');
  return prisma.task.update({ where: { id }, data });
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
          notifySms: task.notifySms, critical: task.critical, dependencies: { create: task.dependencies.map((dependency) => ({ dependsOnId: dependency.dependsOnId })) },
          recurrence: { create: { frequency: task.recurrence.frequency, interval: task.recurrence.interval, byWeekday: task.recurrence.byWeekday, until: task.recurrence.until, count: task.recurrence.count ? task.recurrence.count - 1 : null } },
        } });
      }
    }
    return completed;
  });
}

export async function startTask(userId: string, id: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null }, include: { user: { include: { preference: true } }, workSessions: { where: { endedAt: null } } } });
    if (!task) throw new Error('NOT_FOUND');
    if (task.user.preference?.personalizationEnabled && task.workSessions.length === 0) {
      await tx.taskWorkSession.create({ data: { userId, taskId: id, startedAt: now } });
    }
    return tx.task.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: task.user.preference?.personalizationEnabled ? (task.startedAt ?? now) : task.startedAt } });
  });
}

export async function deleteTask(userId: string, id: string) {
  return updateTask(userId, id, { deletedAt: new Date(), status: 'CANCELLED' });
}

export async function scheduleTask(userId: string, id: string, startAt: Date, durationMin?: number) {
  const duration = durationMin ?? 30;
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null }, include: { user: { include: { preference: true } } } });
    if (!task) throw new Error('NOT_FOUND');
    const postponed = Boolean(task.user.preference?.personalizationEnabled && task.startAt && startAt.getTime() > task.startAt.getTime());
    return tx.task.update({ where: { id }, data: {
      startAt,
      dueAt: task.dueAt ?? new Date(startAt.getTime() + duration * 60_000),
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
