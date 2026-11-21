import { prisma } from '@/server/db';

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
