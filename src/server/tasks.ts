import { classifyNewTask } from './task-agent/service';
import { requireAvailableTaskBatch } from './availability';
import { requireNonoverlappingBatch } from '@/lib/schedule-warning';
import { nextTaskStart } from '@/lib/task-next-occurrence';
import type { Prisma } from '@/generated/prisma';
import { prisma } from './db';
import { validateProjectAssignment } from './projects';
import { zonedDateTime, tzToday } from '@/lib/time';
import { cancelTaskReminders, scheduleDefaultReminders } from './reminders';
import { inc } from '@/lib/metrics';

export async function createTask(input: {
  userId: string;
  title: string;
  notes?: string;
  kind?: string;
  status?: string;
  priority?: string;
  startAt?: Date | null;
  dueAt?: Date | null;
  reminderAt?: Date | null;
  lifeReminderType?: string | null;
  lifeReminderConfidence?: number | null;
  originalUserText?: string | null;
  durationMin?: number;
  energyLevel?: string;
  waitingOn?: string | null;
  critical?: boolean;
  listId?: string | null;
  idempotencyKey?: string;
  projectId?: string | null;
}) {
  if (!input.title.trim() || input.title.length > 200 || (input.durationMin !== undefined && (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin > 1440))) throw new Error('INVALID_TASK');
  if ([input.startAt, input.dueAt, input.reminderAt].some((date) => date && !Number.isFinite(+date))) throw new Error('INVALID_TASK');
  if (input.idempotencyKey) {
    const existing = await prisma.task.findFirst({ where: { idempotencyKey: input.idempotencyKey, userId: input.userId } });
    if (existing) return existing;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { timeZone: true } });
  try { return await prisma.$transaction(async tx => {
    await validateProjectAssignment(tx, input.userId, input.projectId ?? null);
    const task = await tx.task.create({
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
        reminderAt: input.reminderAt ?? null,
        lifeReminderType: input.lifeReminderType ?? null,
        lifeReminderConfidence: input.lifeReminderConfidence ?? null,
        originalUserText: input.originalUserText ?? null,
        durationMin: input.durationMin ?? 30,
        energyLevel: input.energyLevel ?? 'MEDIUM',
        waitingOn: input.waitingOn ?? null,
        critical: input.critical ?? false,
        listId: input.listId ?? null,
        projectId: input.projectId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await classifyNewTask(tx, task);
    return task;
  }); } catch (error) {
    // Concurrent retries can both miss the initial read; the unique key picks one winner.
    if (input.idempotencyKey && error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const existing = await prisma.task.findFirst({ where: { userId: input.userId, idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function updateTask(userId: string, id: string, data: Prisma.TaskUpdateInput) {
  return prisma.$transaction(async tx => {
    const existing = await tx.task.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) throw new Error('NOT_FOUND');
    if (data.project?.connect?.id) await validateProjectAssignment(tx, userId, data.project.connect.id);
    const updated = await tx.task.update({ where: { id }, data });
    if (updated.deletedAt || ['COMPLETED', 'CANCELLED'].includes(updated.status)) await cancelTaskReminders(tx, userId, id);
    if (updated.title !== existing.title || updated.notes !== existing.notes) await classifyNewTask(tx, updated);
    return updated;
  });
}

export async function completeTask(userId: string, id: string, allowScheduleConflict = false) {
  return (await completeTasks(userId, [id], allowScheduleConflict))[0];
}

export async function completeTasks(userId: string, ids: string[], allowScheduleConflict = false) {
  const now = new Date();
  const snapshots = await prisma.task.findMany({ where: { userId, id: { in: ids }, deletedAt: null }, include: { recurrence: true } });
  if (snapshots.length !== ids.length) throw new Error('NOT_FOUND');
  const slots = snapshots.map(task => ({ id: task.id, start: task.status === 'COMPLETED' ? null : nextTaskStart(task, now), durationMin: task.durationMin }));
  requireNonoverlappingBatch(slots, allowScheduleConflict);
  await requireAvailableTaskBatch(userId, slots, allowScheduleConflict);
  return prisma.$transaction(async tx => {
    const results = [];
    for (const id of ids) {
      const snapshot = snapshots.find(task => task.id === id)!;
      const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null }, include: { user: { include: { preference: true } }, workSessions: true, recurrence: true, dependencies: true, tags: true, subtasks: true } });
      if (!task) throw new Error('NOT_FOUND');
      // Reject a stale preflight rather than applying an unchecked schedule.
      if (+task.updatedAt !== +snapshot.updatedAt || task.status !== snapshot.status || JSON.stringify(task.recurrence) !== JSON.stringify(snapshot.recurrence)) throw new Error('TASK_CHANGED');
      results.push(await completeTaskInTransaction(tx, task, slots.find(slot => slot.id === id)!.start, now));
    }
    return results;
  }, { timeout: 15000 });
}

type CompletionTask = Prisma.TaskGetPayload<{ include: { user: { include: { preference: true } }; workSessions: true; recurrence: true; dependencies: true; tags: true; subtasks: true } }>;
async function completeTaskInTransaction(tx: Prisma.TransactionClient, task: CompletionTask, recurringStart: Date | null, now: Date) {
    const { userId, id } = task;
    if (task.status === 'COMPLETED') { await cancelTaskReminders(tx, userId, id); return task; }
    if (task.status === 'CANCELLED') throw new Error('INVALID_TASK_STATE');
    const claimed = await tx.task.updateMany({ where: { id, userId, status: task.status, updatedAt: task.updatedAt, deletedAt: null }, data: { status: 'COMPLETED', completedAt: now } });
    if (claimed.count !== 1) throw new Error('TASK_CHANGED');
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
    await cancelTaskReminders(tx, userId, id);
    if (task.recurrence && task.startAt && recurringStart) {
      const nextStart = recurringStart;
      const dueOffset = task.dueAt ? task.dueAt.getTime() - task.startAt.getTime() : 0;
      const reminderOffset = task.reminderAt ? task.reminderAt.getTime() - task.startAt.getTime() : null;
      const nextReminderAt = reminderOffset === null ? null : new Date(nextStart.getTime() + reminderOffset);
      const nextTask = await tx.task.create({ data: {
        userId, listId: task.listId, projectId: task.projectId, categoryId: task.categoryId, title: task.title, notes: task.notes, kind: task.kind,
        status: 'PLANNED', priority: task.priority, startAt: nextStart, dueAt: task.dueAt ? new Date(nextStart.getTime() + dueOffset) : null,
        reminderAt: nextReminderAt,
        lifeReminderType: task.lifeReminderType, lifeReminderConfidence: task.lifeReminderConfidence, originalUserText: task.originalUserText,
        durationMin: task.durationMin, energyLevel: task.energyLevel, timeZone: task.timeZone, notifyPush: task.notifyPush, notifyEmail: task.notifyEmail,
        splittable: task.splittable, minFocusMin: task.minFocusMin,
        waitingOn: task.waitingOn, assignee: task.assignee,
        tags: { create: task.tags.map(tag => ({ tagId: tag.tagId })) },
        subtasks: { create: task.subtasks.map(subtask => ({ title: subtask.title, sortOrder: subtask.sortOrder })) },
        notifySms: task.notifySms, critical: task.critical, dependencies: { create: task.dependencies.map((dependency) => ({ dependsOnId: dependency.dependsOnId })) },
        recurrence: { create: { anchorDay: task.recurrence.anchorDay ?? tzToday(task.timeZone, task.startAt).getUTCDate(), frequency: task.recurrence.frequency, interval: task.recurrence.interval, byWeekday: task.recurrence.byWeekday, until: task.recurrence.until, count: task.recurrence.count ? task.recurrence.count - 1 : null } },
      } });
      await classifyNewTask(tx, nextTask);
      if (!nextReminderAt) await scheduleDefaultReminders(userId, nextTask.id, nextTask.dueAt ?? nextStart, task.critical, tx);
      if (nextReminderAt) await tx.reminder.create({ data: {
        userId, taskId: nextTask.id, fireAt: nextReminderAt, offsetLabel: 'requested reminder', critical: task.critical,
        idempotencyKey: `${nextTask.id}:requested`, channelPlan: task.critical ? 'push,email,sms' : 'push,email',
      } });
    }

    if (task.lifeReminderType) inc('life_reminder_completed');
    return completed;
}

export async function startTask(userId: string, id: string, now = new Date(), db?: Prisma.TransactionClient) {
  const start = async (tx: Prisma.TransactionClient) => {
    const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null }, include: { user: { include: { preference: true } }, workSessions: { where: { endedAt: null } } } });
    if (!task) throw new Error('NOT_FOUND');
    if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new Error('INVALID_TASK_STATE');
    if (task.user.preference?.personalizationEnabled && task.workSessions.length === 0) {
      await tx.taskWorkSession.create({ data: { userId, taskId: id, startedAt: now } });
    }
    return tx.task.update({ where: { id }, data: { status: 'IN_PROGRESS', completedAt: null, startedAt: task.user.preference?.personalizationEnabled ? (task.startedAt ?? now) : task.startedAt } });
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

export async function deleteTask(userId: string, id: string, db?: Prisma.TransactionClient) {
  const remove = async (tx: Prisma.TransactionClient) => {
    const task = await tx.task.findFirst({ where: { id, userId } });
    if (!task) throw new Error('NOT_FOUND');
    await cancelTaskReminders(tx, userId, id);
    return tx.task.update({ where: { id }, data: { deletedAt: task.deletedAt ?? new Date(), status: 'CANCELLED' } });
  };
  return db ? remove(db) : prisma.$transaction(remove);
}

export async function scheduleTask(userId: string, id: string, startAt: Date, durationMin?: number, metadata: Prisma.TaskUpdateInput = {}) {
  const duration = durationMin ?? 30;
  if (!Number.isFinite(+startAt) || !Number.isInteger(duration) || duration < 1 || duration > 1440) throw new Error('INVALID_TASK');
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null }, include: { user: { include: { preference: true } } } });
    if (!task) throw new Error('NOT_FOUND');
    if (metadata.project?.connect?.id) await validateProjectAssignment(tx, userId, metadata.project.connect.id);
    const postponed = Boolean(task.user.preference?.personalizationEnabled && task.startAt && startAt.getTime() > task.startAt.getTime());
    const startAndDueCoupled = task.dueAt != null && task.startAt != null && task.dueAt.getTime() === task.startAt.getTime();
    const shiftedDueAt = startAndDueCoupled ? new Date(startAt) : task.dueAt;
    const shiftedReminderAt = task.reminderAt && task.startAt ? new Date(task.reminderAt.getTime() + startAt.getTime() - task.startAt.getTime()) : task.reminderAt;
    return tx.task.update({ where: { id }, data: {
      ...metadata,
      startAt,
      completedAt: null,
      dueAt: shiftedDueAt,
      reminderAt: shiftedReminderAt,
      durationMin: duration,
      status: typeof metadata.status === 'string' ? metadata.status : 'PLANNED',
      postponeCount: postponed ? { increment: 1 } : undefined,
      lastRescheduledAt: postponed ? new Date() : undefined,
    } });
  });
}

export function localWhen(ymdValue: string, hm: string | undefined, timeZone: string) {
  return zonedDateTime(ymdValue, hm || '09:00', timeZone);
}
