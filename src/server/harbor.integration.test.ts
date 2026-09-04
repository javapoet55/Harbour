import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@/generated/prisma';
import { createTask, completeTask, scheduleTask, deleteTask, startTask } from './tasks';
import { scheduleDefaultReminders, tickReminders } from './reminders';
import { syncConnection } from './calendar-sync';
import { nextEscalationChannel } from '@/lib/escalation';
import { zonedDateTime } from '@/lib/time';
import { applyReplanProposal, generateReplanProposal } from './replanner';
import { runConversationalAgent } from './conversational-agent';
import { buildPersonalizedInsights, erasePersonalizationData } from './predictions';

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
        provider: 'mock',
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

  it('creates the next bounded recurring task when an occurrence completes', async () => {
    const start = zonedDateTime('2026-09-07', '09:30', 'America/Los_Angeles');
    const recurring = await createTask({ userId: userA, title: 'Weekday standup', startAt: start, dueAt: new Date(start.getTime() + 30 * 60_000) });
    await prisma.recurrenceRule.create({ data: { taskId: recurring.id, frequency: 'WEEKLY', interval: 1, byWeekday: '1,3,5', count: 3 } });
    await completeTask(userA, recurring.id);
    const next = await prisma.task.findFirstOrThrow({ where: { userId: userA, title: 'Weekday standup', status: 'PLANNED' }, include: { recurrence: true } });
    expect(next.startAt).toEqual(zonedDateTime('2026-09-09', '09:30', 'America/Los_Angeles'));
    expect(next.recurrence?.count).toBe(2);
  });

  it('applies an approved replan and rejects a stale proposal', async () => {
    const now = new Date('2026-09-08T15:00:00Z');
    const movable = await createTask({ userId: userA, title: 'Unfinished replan work', startAt: new Date('2026-09-08T14:00:00Z'), durationMin: 30 });
    const proposal = await generateReplanProposal(userA, now);
    expect(proposal.actionId).toBeTruthy();
    expect(proposal.moves.some((move) => move.taskId === movable.id)).toBe(true);
    const applied = await applyReplanProposal(userA, proposal.actionId!);
    expect(applied.moved).toBeGreaterThan(0);
    const moved = await prisma.task.findUniqueOrThrow({ where: { id: movable.id } });
    expect(moved.startAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(await prisma.activityLog.count({ where: { taskId: movable.id, kind: 'AUTO_REPLAN' } })).toBe(1);

    const staleTask = await createTask({ userId: userA, title: 'Stale replan work', startAt: new Date('2026-09-08T14:30:00Z'), durationMin: 30 });
    const staleProposal = await generateReplanProposal(userA, now);
    expect(staleProposal.actionId).toBeTruthy();
    await prisma.task.update({ where: { id: staleTask.id }, data: { title: 'User edited this after planning' } });
    await expect(applyReplanProposal(userA, staleProposal.actionId!)).rejects.toThrow('STALE_REPLAN');
  });

  it('extracts, previews, and atomically applies a structured multi-action agent plan', async () => {
    const existing = await createTask({ userId: userA, title: 'Draft proposal', durationMin: 30 });
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const plan = {
      interpretation: 'Extend the proposal work and add a follow-up call after lunch.',
      response: 'I prepared two changes for your approval.',
      needs_clarification: false,
      clarification_question: null,
      actions: [
        { type: 'UPDATE_TASK', task_ids: [existing.id], title: null, notes: null, priority: 'HIGH', status: null, start_at: null, due_at: null, reminder_at: null, duration_min: 120, project_id: null, rationale: 'Reserve two hours for the proposal.' },
        { type: 'CREATE_TASK', task_ids: [], title: 'Call Sarah', notes: null, priority: 'NORMAL', status: 'PLANNED', start_at: '2026-09-09T20:00:00.000Z', due_at: '2026-09-09T20:00:00.000Z', reminder_at: '2026-09-09T19:45:00.000Z', duration_min: 30, project_id: null, rationale: 'Call Sarah after lunch.' },
      ],
      memory_updates: [{ key: 'preference:lunch_time', value: '12:30', kind: 'preference', confidence: 1 }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(plan) }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    try {
      const preview = await runConversationalAgent(userA, 'Keep two hours for the proposal and remind me to call Sarah after lunch.');
      expect(preview.confirmation?.actionId).toBeTruthy();
      expect(preview.visual.tasks).toHaveLength(2);
      await runConversationalAgent(userA, 'yes', preview.confirmation!.actionId);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: existing.id } })).durationMin).toBe(120);
      const created = await prisma.task.findFirstOrThrow({ where: { userId: userA, title: 'Call Sarah' } });
      expect(await prisma.reminder.count({ where: { taskId: created.id } })).toBeGreaterThan(0);
      expect((await prisma.userMemory.findUniqueOrThrow({ where: { userId_key: { userId: userA, key: 'preference:lunch_time' } } })).value).toBe('12:30');
    } finally {
      vi.unstubAllGlobals();
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it('learns task duration and postponement only after consent and supports erasure', async () => {
    await prisma.userPreference.update({ where: { userId: userA }, data: { personalizationEnabled: true, personalizationConsentAt: new Date() } });
    const scheduled = new Date(Date.now() + 60 * 60_000);
    const measured = await createTask({ userId: userA, title: 'Measured writing', kind: 'writing', startAt: scheduled, dueAt: new Date(Date.now() + 3 * 60 * 60_000), durationMin: 30 });
    await startTask(userA, measured.id, new Date(Date.now() - 52 * 60_000));
    await completeTask(userA, measured.id);
    const completed = await prisma.task.findUniqueOrThrow({ where: { id: measured.id } });
    expect(completed.actualDurationMin).toBeGreaterThanOrEqual(51);
    expect(completed.actualDurationMin).toBeLessThanOrEqual(53);
    const postponed = await createTask({ userId: userA, title: 'Postpone sample', startAt: scheduled, durationMin: 20 });
    await scheduleTask(userA, postponed.id, new Date(scheduled.getTime() + 60 * 60_000), 20);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: postponed.id } })).postponeCount).toBe(1);
    const insights = await buildPersonalizedInsights(userA);
    expect(insights.enabled).toBe(true);
    if (insights.enabled) expect(insights.durationInsights.some((item) => item.category === 'writing')).toBe(true);
    await erasePersonalizationData(userA);
    expect(await prisma.taskWorkSession.count({ where: { userId: userA } })).toBe(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: measured.id } })).actualDurationMin).toBeNull();
  });
});
