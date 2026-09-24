import { measuredJob, recordEvent } from '@/server/health/telemetry';
import { prisma } from './db';
import type { Prisma } from '@/generated/prisma';
import { anyDelivered, escalationExhausted, isPermanentFailure, nextEscalationChannel, SMS_NO_PHONE_NUMBER, type Attempt, type Channel, type EscalationPrefs } from '@/lib/escalation';
import { emailProvider, pushProvider, smsProvider } from '@/providers';
import { reminderMessage } from './email/messages';
import { taskDueLabel } from '@/lib/task-timeline';
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
    await upsertReminderOccurrence(prisma, {
      userId,
      taskId,
      fireAt,
      offsetLabel: offset.label,
      critical,
      idempotencyKey: key,
      channelPlan: critical ? 'push,email,sms' : 'push,email',
    });
  }
}

export async function scheduleRequestedReminder(userId: string, taskId: string, fireAt: Date, critical = false) {
  const idempotencyKey = `${taskId}:requested`;
  return upsertReminderOccurrence(
    prisma,
    { userId, taskId, fireAt, offsetLabel: 'requested reminder', critical, idempotencyKey, channelPlan: critical ? 'push,email,sms' : 'push,email' },
    { critical },
  );
}

type ReminderDb = Pick<Prisma.TransactionClient, 'reminder'>;

/**
 * Opens a reminder's next occurrence. Moving it to a different time bumps its generation, so the attempts
 * made for the old time (kept as history) no longer count for escalation, retries or DELIVERED, and it
 * fires again. Saving the same time again leaves it exactly as it is, so editing a task's details does
 * not re-send a reminder that already went out.
 */
export async function upsertReminderOccurrence(db: ReminderDb, create: Prisma.ReminderUncheckedCreateInput, update: Prisma.ReminderUncheckedUpdateInput = {}) {
  const { idempotencyKey, fireAt } = create;
  await db.reminder.updateMany({ where: { idempotencyKey, NOT: { fireAt } }, data: { ...update, fireAt, status: 'SCHEDULED', generation: { increment: 1 } } });
  return db.reminder.upsert({ where: { idempotencyKey }, update, create });
}

/** Moves an existing reminder to `fireAt` as a new occurrence, as a snooze does. */
export function reopenReminder(db: ReminderDb, id: string, fireAt: Date) {
  return db.reminder.update({ where: { id }, data: { fireAt, status: 'SCHEDULED', generation: { increment: 1 } } });
}

async function tickRemindersImpl(now = new Date()) {
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
    const escalation: EscalationPrefs = {
      pushEnabled: prefs.pushEnabled,
      emailEnabled: prefs.emailEnabled,
      smsEnabled: prefs.smsEnabled,
      escalateToEmailMinutes: prefs.escalateToEmailMinutes,
      escalateToSmsMinutes: prefs.escalateToSmsMinutes,
      critical: reminder.critical,
    };
    // `failureReason` is what tells a channel that can never work for this account from one that is
    // merely down, so it decides whether to move on or to retry.
    // Only this occurrence's attempts count; those made before the reminder was moved are history.
    let history: Attempt[] = reminder.attempts.filter((a) => a.generation === reminder.generation).map((a) => ({
      channel: a.channel as Channel,
      status: a.status as Attempt['status'],
      createdAt: a.createdAt,
      sentAt: a.sentAt,
      failureReason: a.failureReason,
    }));
    // A channel that can never work for this account is given up without waiting for the next tick, so
    // an account with no push subscription still gets its email on this one. One hop per channel at
    // most, so a tick stays bounded however badly delivery is going.
    for (let hop = 0; hop < 3; hop += 1) {
      const channel = nextEscalationChannel(escalation, history, now);
      if (!channel) break;

      const healthStarted = performance.now();
      const title = reminder.task?.title ?? 'Harbor reminder';
      const body = reminder.offsetLabel;
      let result: { id: string; status: 'SENT' | 'FAILED'; reason?: string } = { id: '', status: 'FAILED', reason: 'unknown' };
      if (channel === 'push') result = await pushProvider.send({ userId: reminder.userId, title, body });
      if (channel === 'email') result = await emailProvider.send({ to: reminder.user.email, ...reminderMessage(title, body, reminderDueLabel(reminder.task, reminder.user.timeZone, now)) });
      if (channel === 'sms') result = prefs.phoneNumber
        ? await smsProvider.send({ to: prefs.phoneNumber, text: `${title}: ${body}` })
        : { id: '', status: 'FAILED', reason: SMS_NO_PHONE_NUMBER };

      // Stamped from the tick's own clock so the backoff reads the same timeline the scheduler runs
      // on, rather than the database's separate `now()`.
      const attempt: Attempt = { channel, status: result.status, createdAt: now, sentAt: result.status === 'SENT' ? now : null, failureReason: result.reason ?? null };
      await prisma.notificationAttempt.create({
        data: {
          reminderId: reminder.id,
          generation: reminder.generation,
          channel,
          status: result.status,
          failureReason: result.reason,
          providerId: result.id,
          retryCount: history.filter((item) => item.channel === channel && item.status === 'FAILED').length,
          createdAt: now,
          sentAt: result.status === 'SENT' ? now : null,
        },
      });
      history = [...history, attempt];
      await recordEvent({kind:'job',service:'Task reminder',operation:reminder.id,status:result.status==='SENT'?200:500,durationMs:performance.now()-healthStarted,errorCode:result.status==='SENT'?undefined:'DELIVERY_FAILED'});
      inc(result.status === 'SENT' ? 'notifications.sent' : 'notifications.failed');
      inc(`notifications.${channel}`);
      log('info', 'reminder.attempt', { channel, status: result.status, retry: reminder.status === 'RETRYING' });
      processed += 1;
      // Only a dead channel hands over inside this tick; a transient failure waits out its backoff.
      if (result.status === 'SENT' || !isPermanentFailure(result.reason)) break;
    }

    // FAILED is reserved for a reminder that never reached the user at all. One that did stays QUEUED
    // while a later channel may still escalate, then ends DELIVERED, which leaves the due query.
    const exhausted = escalationExhausted(escalation, history);
    const status = anyDelivered(history) ? (exhausted ? 'DELIVERED' : 'QUEUED')
      : exhausted ? 'FAILED'
      : 'RETRYING';
    // Scoped to the generation read above: a reminder moved while this tick was sending keeps the new
    // occurrence's SCHEDULED status rather than taking the old one's outcome.
    const settled = status !== reminder.status && (await prisma.reminder.updateMany({ where: { id: reminder.id, generation: reminder.generation }, data: { status } })).count > 0;
    if (settled && status === 'FAILED') { log('info', 'reminder.exhausted', { attempts: history.length }); inc('reminders.exhausted'); }
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
    data: { reminderId, generation: reminder.generation, channel: 'push', status: 'OPENED', openedAt: new Date() },
  });
  if (reminder.task?.lifeReminderType) inc('life_reminder_notification_opened');
}

export const tickReminders = (...args: Parameters<typeof tickRemindersImpl>) => measuredJob('Reminder scheduler', () => tickRemindersImpl(...args));

function reminderDueLabel(task: { dueAt: Date | null; startAt: Date | null } | null, timeZone: string, now: Date) {
  if (!task?.dueAt && !task?.startAt) return undefined;
  return taskDueLabel({ dueAt: task.dueAt?.toISOString() ?? null, startAt: task.startAt?.toISOString() ?? null }, timeZone, now);
}
