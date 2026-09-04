import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@/generated/prisma';
import { createTask, completeTask, scheduleTask, deleteTask } from './tasks';
import { scheduleDefaultReminders, tickReminders } from './reminders';
import { syncConnection } from './calendar-sync';
import { nextEscalationChannel } from '@/lib/escalation';
import { zonedDateTime } from '@/lib/time';

const prisma = new PrismaClient();

describe('task and reminder integration', () => {
  let userA = '';
  let userB = '';

  beforeAll(async () => {
    const hash = await bcrypt.hash('test-pass', 8);
    const a = await prisma.user.create({
      data: {
        email: `a-${Date.now()}@harbor.test`,
        name: 'User A',
        passwordHash: hash,
        timeZone: 'America/Los_Angeles',
        preference: { create: { smsEnabled: true, escalateToEmailMinutes: 0, escalateToSmsMinutes: 0 } },
      },
    });
    const b = await prisma.user.create({
      data: {
        email: `b-${Date.now()}@harbor.test`,
        name: 'User B',
        passwordHash: hash,
        timeZone: 'America/New_York',
        preference: { create: {} },
      },
    });
    userA = a.id;
    userB = b.id;
  });

  afterAll(async () => {
    await prisma.notificationAttempt.deleteMany({ where: { reminder: { userId: { in: [userA, userB] } } } });
    await prisma.reminder.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.task.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.calendarEvent.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.calendarConnection.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('creates, completes, and soft-deletes only the owner’s tasks', async () => {
    const task = await createTask({
      userId: userA,
      title: 'Isolation check',
      idempotencyKey: `iso-${userA}`,
    });
    const again = await createTask({
      userId: userA,
      title: 'Isolation check',
      idempotencyKey: `iso-${userA}`,
    });
    expect(again.id).toBe(task.id);

    const foreign = await prisma.task.findFirst({ where: { id: task.id, userId: userB } });
    expect(foreign).toBeNull();

    await completeTask(userA, task.id);
    const completed = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedAt).toBeTruthy();

    const other = await createTask({ userId: userA, title: 'Cancel me' });
    await deleteTask(userA, other.id);
    const cancelled = await prisma.task.findUniqueOrThrow({ where: { id: other.id } });
    expect(cancelled.deletedAt).toBeTruthy();
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('schedules reminders once and escalates push then email', async () => {
    const due = zonedDateTime('2026-09-04', '10:00', 'America/Los_Angeles');
    const task = await createTask({ userId: userA, title: 'Critical call', dueAt: due, startAt: due, critical: true });
    await scheduleDefaultReminders(userA, task.id, due, true);
    await scheduleDefaultReminders(userA, task.id, due, true);
    const reminders = await prisma.reminder.findMany({ where: { taskId: task.id } });
    expect(reminders).toHaveLength(4);

    const now = new Date(due.getTime() - 30 * 60 * 1000);
    const dueNow = reminders.find((r) => r.offsetLabel === 'at due time');
    expect(dueNow).toBeTruthy();
    await prisma.reminder.update({ where: { id: dueNow!.id }, data: { fireAt: now, status: 'QUEUED', critical: true } });
    const first = await tickReminders(now);
    expect(first.processed).toBeGreaterThan(0);
    const afterPush = await prisma.notificationAttempt.findMany({ where: { reminderId: dueNow!.id } });
    expect(afterPush.some((a) => a.channel === 'push')).toBe(true);

    const later = new Date(now.getTime() + 60 * 1000);
    await tickReminders(later);
    const afterEmail = await prisma.notificationAttempt.findMany({ where: { reminderId: dueNow!.id } });
    expect(afterEmail.some((a) => a.channel === 'email')).toBe(true);

    const channel = nextEscalationChannel(
      { pushEnabled: true, emailEnabled: true, smsEnabled: true, escalateToEmailMinutes: 0, escalateToSmsMinutes: 0, critical: true },
      afterEmail.map((a) => ({ channel: a.channel as 'push', status: a.status as 'SENT', createdAt: a.createdAt, sentAt: a.sentAt })),
      later,
    );
    expect(['sms', null]).toContain(channel);
  });

  it('reschedules a task without duplicating the calendar event', async () => {
    const connection = await prisma.calendarConnection.create({
      data: {
        userId: userA,
        provider: 'google',
        accountEmail: 'a@harbor.test',
        calendarId: 'primary',
        calendarName: 'Work',
        writeEnabled: true,
      },
    });
    const when = zonedDateTime('2026-09-05', '11:00', 'America/Los_Angeles');
    const task = await createTask({ userId: userA, title: 'Reschedule me', startAt: when });
    await scheduleTask(userA, task.id, zonedDateTime('2026-09-06', '11:00', 'America/Los_Angeles'), 45);
    const first = await syncConnection(userA, connection.id);
    const second = await syncConnection(userA, connection.id);
    expect(second.created).toBe(0);
    expect(first.lastSyncedAt).toBeTruthy();
  });
});
