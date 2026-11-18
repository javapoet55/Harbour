import type { Prisma } from '@/generated/prisma';
import { prisma } from './db';
import { rangeForNextNDays, startOfLocalDay, tzToday, ymd, zonedDateTime } from '@/lib/time';
import { taskMirrorMatcher } from '@/lib/schedule-intelligence';

const openStatuses = ['INBOX', 'PLANNED', 'IN_PROGRESS', 'WAITING'];

export async function listTasksInRange(userId: string, from: Date, to: Date) {
  return prisma.task.findMany({
    where: {
      userId,
      deletedAt: null,
      status: { not: 'CANCELLED' },
      OR: [
        { dueAt: { gte: from, lte: to } },
        { startAt: { gte: from, lte: to } },
      ],
    },
    include: { category: true, project: true, subtasks: true, reminders: true, recurrence: true, dependencies: { select: { dependsOnId: true, dependsOn: { select: { status: true } } } } },
    orderBy: [{ startAt: 'asc' }, { dueAt: 'asc' }],
  });
}

export async function listEventsInRange(userId: string, from: Date, to: Date, db: Prisma.TransactionClient = prisma) {
  return db.calendarEvent.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [{ connectionId: null }, { connection: { visible: true } }],
      startAt: { lte: to },
      endAt: { gte: from },
    },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * Events to show next to tasks: a timed task pushed to a connected calendar comes back as a
 * CalendarEvent, and listing both shows the same item twice. The mirror is kept if it was moved.
 */
export async function listDisplayEventsInRange(userId: string, from: Date, to: Date, db: Prisma.TransactionClient = prisma) {
  const events = await listEventsInRange(userId, from, to, db);
  if (!events.length) return events;
  const externalIds = events.flatMap((event) => event.externalId ? [event.externalId] : []);
  const linked = await db.task.findMany({
    where: { userId, OR: [{ calendarEventId: { in: events.map((event) => event.id) } }, ...(externalIds.length ? [{ calendarEventId: null, externalEventId: { in: externalIds } }] : [])] },
    select: { id: true, title: true, status: true, priority: true, startAt: true, dueAt: true, durationMin: true, deletedAt: true, calendarEventId: true, externalEventId: true },
  });
  if (!linked.length) return events;
  const isMirror = taskMirrorMatcher(events, linked.map((task) => ({ ...task, status: task.deletedAt ? 'CANCELLED' : task.status })));
  return events.filter((event) => !isMirror(event));
}

export async function overdueTasks(userId: string, timeZone: string, now = new Date()) {
  const todayStart = startOfLocalDay(ymd(tzToday(timeZone, now)), timeZone);
  return prisma.task.findMany({
    where: {
      userId,
      deletedAt: null,
      status: { in: openStatuses },
      dueAt: { lt: todayStart },
    },
    orderBy: { dueAt: 'asc' },
    include: { category: true, project: true, subtasks: true, recurrence: true },
  });
}

export async function unscheduledTasks(userId: string) {
  return prisma.task.findMany({
    where: {
      userId,
      deletedAt: null,
      status: { in: openStatuses },
      startAt: null,
    },
    orderBy: { dueAt: 'asc' },
    include: { subtasks: true, recurrence: true },
  });
}

export async function waitingTasks(userId: string) {
  return prisma.task.findMany({
    where: { userId, deletedAt: null, status: 'WAITING' },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function highPriority(userId: string) {
  return prisma.task.findMany({
    where: {
      userId,
      deletedAt: null,
      status: { in: openStatuses },
      priority: { in: ['HIGH', 'CRITICAL'] },
    },
    orderBy: { dueAt: 'asc' },
  });
}

export async function snapshotForRange(userId: string, timeZone: string, days: number, now = new Date(), from?: string) {
  const range = rangeForNextNDays(days, timeZone, from ? zonedDateTime(from, '12:00', timeZone) : now);
  const [tasks, events, overdue] = await Promise.all([
    listTasksInRange(userId, range.start, range.end),
    listDisplayEventsInRange(userId, range.start, range.end),
    overdueTasks(userId, timeZone, now),
  ]);
  return { range, tasks, events, overdue };
}

export function taskWhereForUser(userId: string): Prisma.TaskWhereInput {
  return { userId, deletedAt: null };
}
