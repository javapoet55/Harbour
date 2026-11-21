import { z } from 'zod';
import { prisma } from '@/server/db';
import { cancelTaskReminders } from '@/server/reminders';
import { assertReminderCallsUsable } from '@/server/reminder-calls';
import { deleteTask } from '@/server/tasks';
import { pushTaskToExternal } from '@/server/calendar-sync';

export type ReminderChannel = 'popup' | 'email' | 'call';
/** What happened on one channel for the reminder's current time. */
export type ChannelOutcome = 'scheduled' | 'sending' | 'sent' | 'failed' | 'answered' | 'voicemail' | 'missed' | 'cancelled' | 'skipped';
export type ReminderHistoryItem = {
  id: string; title: string; notes: string; at: string; done: boolean; status: string;
  recurring: boolean;
  channels: { channel: ReminderChannel; outcome: ChannelOutcome }[];
};

const SENT = ['SENT', 'DELIVERED', 'OPENED'];

/** Push and email outcome from the attempts made for the reminder's current time. */
export function noticeOutcome(
  channel: 'push' | 'email',
  reminder: { status: string; generation: number; fireAt: Date; attempts: { channel: string; status: string; generation: number }[] } | null,
  now: Date,
): ChannelOutcome {
  if (!reminder) return 'skipped';
  const mine = reminder.attempts.filter((a) => a.channel === channel && a.generation === reminder.generation);
  if (mine.some((a) => SENT.includes(a.status))) return 'sent';
  if (reminder.status === 'CANCELLED') return 'cancelled';
  if (reminder.status === 'EXPIRED') return 'skipped';
  if (mine.length && ['FAILED', 'DELIVERED'].includes(reminder.status)) return 'failed';
  if (reminder.fireAt > now) return 'scheduled';
  // Due, not yet tried on this channel: email waits for the escalation delay after the pop-up.
  if (['FAILED', 'DELIVERED'].includes(reminder.status)) return 'skipped';
  return mine.length ? 'failed' : 'sending';
}

/** Outcome of the phone calls for the reminder's current time; the latest attempt decides. */
export function callOutcome(calls: { fireAt: Date; attempt: number; status: string }[], at: Date | null, now: Date, done: boolean): ChannelOutcome {
  const mine = calls.filter((c) => at && c.fireAt.getTime() === at.getTime()).sort((a, b) => b.attempt - a.attempt);
  const answered = mine.find((c) => c.status === 'COMPLETED');
  if (answered) return 'answered';
  if (mine.some((c) => c.status === 'VOICEMAIL')) return 'voicemail';
  const last = mine[0];
  if (!last) return at && at > now && !done ? 'scheduled' : done ? 'cancelled' : 'skipped';
  if (['QUEUED', 'DIALING', 'IN_PROGRESS'].includes(last.status)) return last.status === 'QUEUED' && last.attempt > 1 ? 'missed' : 'sending';
  if (last.status === 'MISSED') return 'missed';
  if (last.status === 'CANCELLED') return 'cancelled';
  if (last.status === 'EXPIRED') return 'skipped';
  return 'failed';
}

/** Every reminder the person set (a task with its own reminder time), newest first, with how each channel went. */
export async function reminderHistory(userId: string, now = new Date()): Promise<ReminderHistoryItem[]> {
  const tasks = await prisma.task.findMany({
    where: { userId, deletedAt: null, reminderAt: { not: null } },
    orderBy: { reminderAt: 'desc' },
    take: 300,
    select: {
      id: true, title: true, notes: true, status: true, reminderAt: true, notifyPush: true, notifyEmail: true, notifyCall: true,
      recurrence: { select: { id: true } },
      reminders: { select: { status: true, generation: true, fireAt: true, attempts: { select: { channel: true, status: true, generation: true } } } },
      reminderCalls: { select: { fireAt: true, attempt: true, status: true } },
    },
  });
  return tasks.map((task) => {
    const done = task.status === 'COMPLETED';
    // The reminder for the task's own reminder time (a voice-set or hand-made reminder has exactly one).
    const reminder = task.reminders.find((r) => r.fireAt.getTime() === task.reminderAt!.getTime()) ?? task.reminders[0] ?? null;
    const channels: ReminderHistoryItem['channels'] = [];
    if (task.notifyPush) channels.push({ channel: 'popup', outcome: noticeOutcome('push', reminder, now) });
    if (task.notifyEmail) channels.push({ channel: 'email', outcome: noticeOutcome('email', reminder, now) });
    if (task.notifyCall) channels.push({ channel: 'call', outcome: callOutcome(task.reminderCalls, task.reminderAt, now, done) });
    return {
      id: task.id, title: task.title, notes: task.notes, at: task.reminderAt!.toISOString(), done, status: task.status,
      recurring: !!task.recurrence, channels,
    };
  });
}

// ---------- Editing and deleting from the Reminders tab ----------

const reminderEdit = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(4000),
  at: z.string().datetime({ offset: true }),
  notifyPush: z.boolean(),
  notifyEmail: z.boolean(),
  notifyCall: z.boolean(),
}).strict();

/**
 * Changes a reminder's text, time and channels. A new time must be in the future and starts a fresh
 * occurrence, so every chosen channel goes out again at that time; keeping the time (for example to fix
 * the wording of a past reminder) never re-sends anything. Moving a finished reminder to a future time
 * makes it upcoming again.
 */
export async function updateReminder(userId: string, id: string, raw: unknown, now = new Date()) {
  const parsed = reminderEdit.safeParse(raw);
  if (!parsed.success) throw new Error('INVALID_REMINDER');
  const input = parsed.data;
  const at = new Date(input.at);
  if (!input.notifyPush && !input.notifyEmail && !input.notifyCall) throw new Error('REMINDER_NO_DELIVERY');
  const task = await prisma.task.findFirst({ where: { id, userId, deletedAt: null, reminderAt: { not: null } } });
  if (!task) throw new Error('NOT_FOUND');
  const moved = at.getTime() !== task.reminderAt!.getTime();
  if (moved && at <= now) throw new Error('REMINDER_TIME_PASSED');
  if (input.notifyCall && (!task.notifyCall || moved)) await assertReminderCallsUsable(userId);
  const reopen = moved && task.status === 'COMPLETED';
  const notices = input.notifyPush || input.notifyEmail;
  const addedNotices = notices && !(task.notifyPush || task.notifyEmail) && at > now;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: {
      title: input.title, notes: input.notes,
      notifyPush: input.notifyPush, notifyEmail: input.notifyEmail, notifyCall: input.notifyCall,
      ...(moved ? { reminderAt: at, startAt: at, dueAt: at } : {}),
      ...(reopen ? { status: 'PLANNED', completedAt: null } : {}),
    } });
    if (!notices) { await cancelTaskReminders(tx, userId, id); return; }
    if (moved || addedNotices) {
      const key = `${id}:requested`;
      const existing = await tx.reminder.findUnique({ where: { idempotencyKey: key } });
      if (existing) await tx.reminder.update({ where: { id: existing.id }, data: { fireAt: at, status: 'SCHEDULED', generation: { increment: 1 } } });
      else await tx.reminder.create({ data: { userId, taskId: id, fireAt: at, offsetLabel: 'requested reminder', critical: task.critical, idempotencyKey: key, channelPlan: 'push,email' } });
    }
  });
  if (task.startAt || moved) await pushTaskToExternal(userId, id).catch(() => undefined);
  return (await reminderHistory(userId, now)).find((item) => item.id === id) ?? null;
}

/** Deletes a reminder: nothing more is sent or called for it, and it leaves the task list. */
export async function removeReminder(userId: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, userId, deletedAt: null, reminderAt: { not: null } }, select: { id: true } });
  if (!task) throw new Error('NOT_FOUND');
  await deleteTask(userId, id);
  await prisma.reminderCall.updateMany({ where: { taskId: id, status: 'QUEUED' }, data: { status: 'CANCELLED', error: 'deleted', endedAt: new Date() } });
  await pushTaskToExternal(userId, id).catch(() => undefined);
  return { deleted: true };
}
