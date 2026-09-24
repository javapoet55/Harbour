import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { prisma } from './db';
import { scheduleRequestedReminder, tickReminders } from './reminders';
import { runAssistantTurn } from './assistant';
import { emailProvider, pushProvider } from '@/providers';
import { MAX_CHANNEL_RETRIES, PUSH_NOT_REGISTERED, backoffMs, type Channel } from '@/lib/escalation';

/**
 * Reminder escalation against the REAL push provider (providers/index.ts:59), with VAPID configured
 * so it takes its web-push branch rather than the mock that returns SENT for everything. Only the
 * `web-push` transport itself is stubbed, which is the sole way to make a send fail the way the
 * network does. Email and SMS keep the mock branch the suite pins in vitest.config.ts.
 */
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

const sendNotification = vi.mocked(webpush.sendNotification);
const at = (minutes: number) => new Date(Date.parse('2026-09-04T17:00:00.000Z') + minutes * 60_000);
let userId = '';
let reminderId = '';

const attempts = () => prisma.notificationAttempt.findMany({ where: { reminderId }, orderBy: { createdAt: 'asc' } });
const reminder = () => prisma.reminder.findUniqueOrThrow({ where: { id: reminderId } });
const channels = async () => (await attempts()).map((a) => `${a.channel}:${a.status}`);

async function subscribe() {
  await prisma.pushSubscription.create({ data: { userId, endpoint: `https://push.test/${randomUUID()}`, p256dh: 'key', auth: 'auth' } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Configured, not mocked away: the provider does its real subscription lookup and error handling.
  vi.stubEnv('VAPID_PUBLIC_KEY', 'test-public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key');
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@escalation.test`,
      name: 'Escalation user',
      passwordHash: 'never-send-this-hash',
      timeZone: 'America/Los_Angeles',
      preference: { create: { pushEnabled: true, emailEnabled: true, smsEnabled: false, escalateToEmailMinutes: 15, escalateToSmsMinutes: 45 } },
    },
  });
  userId = user.id;
  const task = await prisma.task.create({ data: { userId, title: 'Critical call', status: 'PLANNED' } });
  const created = await prisma.reminder.create({
    data: { userId, taskId: task.id, fireAt: at(0), offsetLabel: 'at due time', idempotencyKey: `${task.id}:${randomUUID()}`, status: 'SCHEDULED' },
  });
  reminderId = created.id;
});

afterEach(async () => {
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  vi.unstubAllEnvs();
  // `clearAllMocks` only clears calls, so a provider spy would otherwise outlive its test.
  vi.restoreAllMocks();
});

describe('reminder escalation when push cannot be delivered', () => {
  it('emails on the first tick when the account has no push subscription', async () => {
    await tickReminders(at(0));

    // Push is still tried first, reports that it can never work, and hands over without another tick.
    expect(await channels()).toEqual(['push:FAILED', 'email:SENT']);
    expect((await attempts())[0].failureReason).toBe(PUSH_NOT_REGISTERED);
    expect(sendNotification).not.toHaveBeenCalled();
    expect((await reminder()).status).toBe('DELIVERED');
  });

  it('does not try the dead push channel again on later ticks', async () => {
    await tickReminders(at(0));
    const afterFirst = (await attempts()).length;

    await tickReminders(at(60));
    await tickReminders(at(120));

    expect((await attempts()).length).toBe(afterFirst);
    expect((await attempts()).filter((a) => a.channel === 'push')).toHaveLength(1);
  });

  it('retries a transient push failure with backoff, then escalates to email', async () => {
    await subscribe();
    sendNotification.mockRejectedValue(Object.assign(new Error('gateway'), { statusCode: 500 }));

    await tickReminders(at(0));
    expect(await channels()).toEqual(['push:FAILED']);
    expect((await attempts())[0].failureReason).toContain('500');
    expect((await reminder()).status).toBe('RETRYING');

    // Inside the backoff nothing is attempted, so a fast tick loop writes no rows.
    await tickReminders(at(0));
    expect(await channels()).toEqual(['push:FAILED']);

    // One failure so far, so the channel reopens backoffMs(1) later.
    const reopens = new Date(at(0).getTime() + backoffMs(1));
    await tickReminders(reopens);
    expect((await attempts()).filter((a) => a.channel === 'push')).toHaveLength(2);

    // Spend the rest of the retries, each after its own backoff.
    let clock = reopens;
    for (let failures = 2; failures < MAX_CHANNEL_RETRIES; failures += 1) {
      clock = new Date(clock.getTime() + backoffMs(failures));
      await tickReminders(clock);
    }
    expect((await attempts()).filter((a) => a.channel === 'push')).toHaveLength(MAX_CHANNEL_RETRIES);
    expect((await attempts()).map((a) => a.retryCount)).toEqual([0, 1, 2, 3, 4]);

    // Push is spent, so the next tick escalates rather than retrying it a sixth time.
    await tickReminders(new Date(clock.getTime() + backoffMs(MAX_CHANNEL_RETRIES)));
    expect(await channels()).toEqual([...Array(MAX_CHANNEL_RETRIES).fill('push:FAILED'), 'email:SENT']);
    expect((await reminder()).status).toBe('DELIVERED');
  });

  it('rescues a reminder already stuck in RETRYING from before this change', async () => {
    // Exactly what today's stuck rows look like: push retried every tick, always the same permanent
    // reason, `retryCount` never written because nothing used the column.
    await prisma.reminder.update({ where: { id: reminderId }, data: { status: 'RETRYING' } });
    for (let minute = 0; minute < 4; minute += 1) {
      await prisma.notificationAttempt.create({
        data: { reminderId, channel: 'push', status: 'FAILED', failureReason: PUSH_NOT_REGISTERED, retryCount: 0, createdAt: at(-10 + minute) },
      });
    }

    await tickReminders(at(0));

    expect((await attempts()).filter((a) => a.channel === 'email' && a.status === 'SENT')).toHaveLength(1);
    expect((await attempts()).filter((a) => a.channel === 'push')).toHaveLength(4);
    expect((await reminder()).status).toBe('DELIVERED');
  });

  it('ends the reminder FAILED with bounded rows when every channel fails', async () => {
    vi.spyOn(emailProvider, 'send').mockResolvedValue({ id: '', status: 'FAILED', reason: 'SendGrid 500' });

    // Push is dead on the first tick, so email takes over and then burns its own retries.
    let clock = at(0);
    await tickReminders(clock);
    for (let failures = 1; failures <= MAX_CHANNEL_RETRIES; failures += 1) {
      clock = new Date(clock.getTime() + backoffMs(failures));
      await tickReminders(clock);
    }

    const rows = await attempts();
    expect(rows.filter((a) => a.channel === 'push')).toHaveLength(1);
    expect(rows.filter((a) => a.channel === 'email')).toHaveLength(MAX_CHANNEL_RETRIES);
    expect((await reminder()).status).toBe('FAILED');

    // Nothing more is written, and the reminder has left the scheduler's queue for good.
    const settled = rows.length;
    const later = await tickReminders(new Date(clock.getTime() + 24 * 60 * 60_000));
    expect((await attempts()).length).toBe(settled);
    expect(later.scanned).toBe(0);
  });
});

describe('reminder escalation when push works', () => {
  it('sends push first and escalates to email on the configured delay, as before', async () => {
    await subscribe();
    sendNotification.mockResolvedValue({ statusCode: 201, headers: { location: 'https://push.test/receipt' }, body: '' } as Awaited<ReturnType<typeof webpush.sendNotification>>);

    await tickReminders(at(0));
    expect(await channels()).toEqual(['push:SENT']);
    expect((await reminder()).status).toBe('QUEUED');

    // Still inside escalateToEmailMinutes: push succeeded, so nothing else goes out yet.
    await tickReminders(at(14));
    expect(await channels()).toEqual(['push:SENT']);

    await tickReminders(at(16));
    expect(await channels()).toEqual(['push:SENT', 'email:SENT']);
    expect(await pushProvider.send({ userId, title: 't', body: 'b' })).toMatchObject({ status: 'SENT' });

    // Every enabled channel has now reached the user, so the reminder settles and leaves the due query.
    expect((await reminder()).status).toBe('DELIVERED');
    const later = await tickReminders(at(24 * 60));
    expect(later.scanned).toBe(0);
    expect(await channels()).toEqual(['push:SENT', 'email:SENT']);
  });

  it('stops once the user opens the notification', async () => {
    await subscribe();
    sendNotification.mockResolvedValue({ statusCode: 201, headers: {}, body: '' } as Awaited<ReturnType<typeof webpush.sendNotification>>);
    await tickReminders(at(0));
    await prisma.notificationAttempt.create({ data: { reminderId, channel: 'push', status: 'OPENED', openedAt: at(1) } });

    await tickReminders(at(60));

    expect((await attempts()).filter((a) => a.channel === 'email')).toHaveLength(0);
    expect((await reminder()).status).toBe('DELIVERED');
  });
});

describe('backfill of reminders that already reached the user', () => {
  const migration = path.resolve('prisma/sqlite/migrations/20260924000000_reminder_delivered_status/migration.sql');
  async function backfill() {
    const sql = readFileSync(migration, 'utf8').split(/\r?\n/).filter((line) => !line.startsWith('--')).join('\n');
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
  }
  async function stuck(status: string, sent: Array<[Channel, string, string?]>, key: string = randomUUID()) {
    const row = await prisma.reminder.create({ data: { userId, fireAt: at(0), offsetLabel: 'at due time', idempotencyKey: key, status } });
    for (const [channel, attemptStatus, failureReason] of sent) {
      await prisma.notificationAttempt.create({ data: { reminderId: row.id, channel, status: attemptStatus, failureReason, createdAt: at(1) } });
    }
    return row.id;
  }
  const statusOf = async (id: string) => (await prisma.reminder.findUniqueOrThrow({ where: { id } })).status;

  it('settles only reminders with no channel left, as the tick would', async () => {
    const bothSent = await stuck('QUEUED', [['push', 'SENT'], ['email', 'SENT']]);
    const pushDeadEmailSent = await stuck('QUEUED', [['push', 'FAILED', PUSH_NOT_REGISTERED], ['email', 'SENT']]);
    const opened = await stuck('QUEUED', [['push', 'SENT'], ['push', 'OPENED']]);
    const emailStillDue = await stuck('QUEUED', [['push', 'SENT']]);
    const neverReached = await stuck('RETRYING', [['push', 'FAILED', 'gateway 500']]);
    const testSent = await stuck('QUEUED', [['push', 'SENT']], `test:${userId}:1`);
    const testFailed = await stuck('QUEUED', [['sms', 'FAILED', 'Add a phone number in Settings first.']], `test:${userId}:2`);

    await backfill();

    expect(await statusOf(bothSent)).toBe('DELIVERED');
    expect(await statusOf(pushDeadEmailSent)).toBe('DELIVERED');
    expect(await statusOf(opened)).toBe('DELIVERED');
    expect(await statusOf(emailStillDue)).toBe('QUEUED');
    expect(await statusOf(neverReached)).toBe('RETRYING');
    expect(await statusOf(testSent)).toBe('DELIVERED');
    expect(await statusOf(testFailed)).toBe('FAILED');
  });
});

describe('a reminder moved to a new time starts a fresh occurrence', () => {
  const pushWorks = async () => {
    await subscribe();
    sendNotification.mockResolvedValue({ statusCode: 201, headers: {}, body: '' } as Awaited<ReturnType<typeof webpush.sendNotification>>);
  };
  /** The task's requested reminder, delivered on every channel at `at(0)`. */
  async function delivered() {
    await prisma.reminder.delete({ where: { id: reminderId } });
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    reminderId = (await scheduleRequestedReminder(userId, task.id, at(0))).id;
    await tickReminders(at(0));
    await tickReminders(at(16));
    expect(await channels()).toEqual(['push:SENT', 'email:SENT']);
    expect((await reminder()).status).toBe('DELIVERED');
    return task.id;
  }

  it('sends again at the new time after the task is rescheduled, keeping the old attempts', async () => {
    await pushWorks();
    const taskId = await delivered();

    await scheduleRequestedReminder(userId, taskId, at(120));
    expect(await reminder()).toMatchObject({ status: 'SCHEDULED', generation: 1, fireAt: at(120) });

    // Not due yet, so nothing goes out early.
    await tickReminders(at(60));
    expect(await channels()).toEqual(['push:SENT', 'email:SENT']);

    // Push goes first again, and email escalates on its own delay counted from the new push.
    await tickReminders(at(120));
    expect((await reminder()).status).toBe('QUEUED');
    await tickReminders(at(130));
    expect(await channels()).toEqual(['push:SENT', 'email:SENT', 'push:SENT']);
    await tickReminders(at(136));
    expect(await channels()).toEqual(['push:SENT', 'email:SENT', 'push:SENT', 'email:SENT']);
    expect((await attempts()).map((a) => a.generation)).toEqual([0, 0, 1, 1]);
    expect((await reminder()).status).toBe('DELIVERED');
    expect((await tickReminders(at(24 * 60))).scanned).toBe(0);
  });

  it('does not re-send when the task is saved again at the same time', async () => {
    await pushWorks();
    const taskId = await delivered();

    await scheduleRequestedReminder(userId, taskId, at(0), true);

    expect(await reminder()).toMatchObject({ status: 'DELIVERED', generation: 0, critical: true });
    await tickReminders(at(30));
    expect(await channels()).toEqual(['push:SENT', 'email:SENT']);
  });

  it('sends again two hours after a snooze', async () => {
    await pushWorks();
    await delivered();

    await runAssistantTurn(userId, 'snooze that reminder');

    const snoozed = await reminder();
    expect(snoozed).toMatchObject({ status: 'SCHEDULED', generation: 1 });
    expect(Math.abs(snoozed.fireAt.getTime() - (Date.now() + 2 * 60 * 60_000))).toBeLessThan(60_000);
    await tickReminders(snoozed.fireAt);
    expect(await channels()).toEqual(['push:SENT', 'email:SENT', 'push:SENT']);
  });

  it('bounds retries and escalation per occurrence', async () => {
    vi.spyOn(emailProvider, 'send').mockResolvedValue({ id: '', status: 'FAILED', reason: 'SendGrid 500' });
    const exhaust = async (from: Date) => {
      let clock = from;
      await tickReminders(clock);
      for (let failures = 1; failures <= MAX_CHANNEL_RETRIES; failures += 1) {
        clock = new Date(clock.getTime() + backoffMs(failures));
        await tickReminders(clock);
      }
      return clock;
    };
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await prisma.reminder.delete({ where: { id: reminderId } });
    reminderId = (await scheduleRequestedReminder(userId, task.id, at(0))).id;

    // First occurrence: dead push hands over at once, then email burns its retries.
    let clock = await exhaust(at(0));
    expect((await reminder()).status).toBe('FAILED');
    const firstRows = (await attempts()).length;
    expect(firstRows).toBe(1 + MAX_CHANNEL_RETRIES);

    // The new occurrence gets its own, equally bounded, set of attempts.
    await scheduleRequestedReminder(userId, task.id, at(24 * 60));
    clock = await exhaust(at(24 * 60));
    expect((await reminder()).status).toBe('FAILED');
    const rows = await attempts();
    expect(rows).toHaveLength(2 * firstRows);
    expect(rows.filter((a) => a.generation === 1).map((a) => a.retryCount)).toEqual([0, 0, 1, 2, 3, 4]);

    const later = await tickReminders(new Date(clock.getTime() + 24 * 60 * 60_000));
    expect(later.scanned).toBe(0);
    expect(await attempts()).toHaveLength(2 * firstRows);
  });
});
