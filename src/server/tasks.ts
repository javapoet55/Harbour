import type { Prisma } from '@/generated/prisma';
import { prisma } from './db';
import { zonedDateTime } from '@/lib/time';

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
  return updateTask(userId, id, { status: 'COMPLETED', completedAt: new Date() });
}

export async function deleteTask(userId: string, id: string) {
  return updateTask(userId, id, { deletedAt: new Date(), status: 'CANCELLED' });
}

export async function scheduleTask(userId: string, id: string, startAt: Date, durationMin?: number) {
  const duration = durationMin ?? 30;
  return updateTask(userId, id, {
    startAt,
    dueAt: new Date(startAt.getTime() + duration * 60_000),
    durationMin: duration,
    status: 'PLANNED',
  });
}

export function localWhen(ymdValue: string, hm: string | undefined, timeZone: string) {
  return zonedDateTime(ymdValue, hm || '09:00', timeZone);
}
