import type { Prisma } from '@/generated/prisma';
import { prisma } from './db';
import { rangeForNextNDays, startOfLocalDay, tzToday, ymd } from '@/lib/time';

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
    include: { category: true, project: true, subtasks: true, reminders: true },
    orderBy: [{ startAt: 'asc' }, { dueAt: 'asc' }],
  });
}

export async function listEventsInRange(userId: string, from: Date, to: Date) {
  return prisma.calendarEvent.findMany({
    where: {
      userId,
      deletedAt: null,
      startAt: { lte: to },
      endAt: { gte: from },
    },
    orderBy: { startAt: 'asc' },
  });
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
    include: { category: true, project: true },
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

export async function snapshotForRange(userId: string, timeZone: string, days: number, now = new Date()) {
  const range = rangeForNextNDays(days, timeZone, now);
  const [tasks, events, overdue] = await Promise.all([
    listTasksInRange(userId, range.start, range.end),
    listEventsInRange(userId, range.start, range.end),
    overdueTasks(userId, timeZone, now),
  ]);
  return { range, tasks, events, overdue };
}

export function taskWhereForUser(userId: string): Prisma.TaskWhereInput {
  return { userId, deletedAt: null };
}
