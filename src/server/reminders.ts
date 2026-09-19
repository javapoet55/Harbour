import { prisma } from './db';
import { nextEscalationChannel } from '@/lib/escalation';
import { emailProvider, pushProvider, smsProvider } from '@/providers';
import { inc } from '@/lib/metrics';
import { log } from '@/lib/logger';

export async function scheduleDefaultReminders(userId: string, taskId: string, dueAt: Date, critical = false) {
  const offsets = critical
    ? [
        { ms: 24 * 60 * 60 * 1000, label: '1 day before' },
        { ms: 60 * 60 * 1000, label: '1 hour before' },
        { ms: 10 * 60 * 1000, label: '10 minutes before' },
        { ms: 0, label: 'at due time' },
      ]
    : [
        { ms: 30 * 60 * 1000, label: '30 minutes before' },
        { ms: 0, label: 'at due time' },
      ];

  for (const offset of offsets) {
    const fireAt = new Date(dueAt.getTime() - offset.ms);
    const key = `${taskId}:${offset.label}`;
    await prisma.reminder.upsert({
      where: { idempotencyKey: key },
      update: { fireAt, status: 'SCHEDULED' },
      create: {
        userId,
        taskId,
        fireAt,
        offsetLabel: offset.label,
        critical,
        idempotencyKey: key,
        channelPlan: critical ? 'push,email,sms' : 'push,email',
      },
    });
  }
}

export async function scheduleRequestedReminder(userId: string, taskId: string, fireAt: Date, critical = false) {
  const idempotencyKey = `${taskId}:requested`;
  return prisma.reminder.upsert({
    where: { idempotencyKey },
    update: { fireAt, critical, status: 'SCHEDULED' },
    create: { userId, taskId, fireAt, offsetLabel: 'requested reminder', critical, idempotencyKey, channelPlan: critical ? 'push,email,sms' : 'push,email' },
  });
}

export async function tickReminders(now = new Date()) {
  const due = await prisma.reminder.findMany({
    where: {
      fireAt: { lte: now },
      status: { in: ['SCHEDULED', 'QUEUED', 'RETRYING'] },
    },
    include: {
      attempts: true,
      user: { include: { preference: true } },
      task: true,
    },
  });

  let processed = 0;
  for (const reminder of due) {
    const prefs = reminder.user.preference;
    if (!prefs) continue;
    const channel = nextEscalationChannel(
      {
        pushEnabled: prefs.pushEnabled,
        emailEnabled: prefs.emailEnabled,
        smsEnabled: prefs.smsEnabled,
        escalateToEmailMinutes: prefs.escalateToEmailMinutes,
        escalateToSmsMinutes: prefs.escalateToSmsMinutes,
        critical: reminder.critical,
      },
      reminder.attempts.map((a) => ({
        channel: a.channel as 'push' | 'email' | 'sms',
        status: a.status as 'SENT',
        createdAt: a.createdAt,
        sentAt: a.sentAt,
      })),
      now,
    );
    if (!channel) continue;

    const title = reminder.task?.title ?? 'Harbor reminder';
    const body = reminder.offsetLabel;
    let result: { id: string; status: 'SENT' | 'FAILED'; reason?: string } = { id: '', status: 'FAILED', reason: 'unknown' };
    if (channel === 'push') result = await pushProvider.send({ userId: reminder.userId, title, body });
    if (channel === 'email') result = await emailProvider.send({ to: reminder.user.email, subject: title, text: body });
    if (channel === 'sms') result = prefs.phoneNumber
      ? await smsProvider.send({ to: prefs.phoneNumber, text: `${title}: ${body}` })
      : { id: '', status: 'FAILED', reason: 'No SMS phone number configured' };

    await prisma.notificationAttempt.create({
      data: {
        reminderId: reminder.id,
        channel,
        status: result.status,
        failureReason: result.reason,
        providerId: result.id,
        sentAt: result.status === 'SENT' ? now : null,
      },
    });
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: result.status === 'SENT' ? 'QUEUED' : 'RETRYING' },
    });
    inc(result.status === 'SENT' ? 'notifications.sent' : 'notifications.failed');
    inc(`notifications.${channel}`);
    log('info', 'reminder.attempt', { channel, status: result.status, retry: reminder.status === 'RETRYING' });
    processed += 1;
  }
  inc('reminders.ticked', processed);
  return { processed, scanned: due.length };
}

export async function acknowledgeReminder(userId: string, reminderId: string) {
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId }, include: { task: { select: { lifeReminderType: true } } } });
  if (!reminder) throw new Error('NOT_FOUND');
  await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: 'CANCELLED', acknowledgedAt: new Date() },
  });
  await prisma.notificationAttempt.create({
    data: { reminderId, channel: 'push', status: 'OPENED', openedAt: new Date() },
  });
  if (reminder.task?.lifeReminderType) inc('life_reminder_notification_opened');
}
