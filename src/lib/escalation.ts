export type Channel = 'push' | 'email' | 'sms';

export type EscalationPrefs = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  escalateToEmailMinutes: number;
  escalateToSmsMinutes: number;
  critical: boolean;
};

export type Attempt = {
  channel: Channel;
  status: 'SCHEDULED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'OPENED' | 'FAILED' | 'RETRYING' | 'CANCELLED';
  createdAt: Date;
  sentAt?: Date | null;
  failureReason?: string | null;
};

/** Attempts per channel, after which that channel is abandoned and the next one takes over. */
export const MAX_CHANNEL_RETRIES = 5;

/** Shared with the push provider so the wording it reports and the rule below cannot drift apart. */
export const PUSH_NOT_REGISTERED = 'No browser push subscription is registered';

/** Shared with the reminder tick for the same reason. */
export const SMS_NO_PHONE_NUMBER = 'No SMS phone number configured';

/**
 * Failures that repeating cannot fix: the user has nothing for this channel to reach, or the server
 * is not configured to use it. Retrying only spends ticks and writes attempt rows, so the channel is
 * given up at once and escalation moves on rather than stalling on it.
 */
export const PERMANENT_FAILURE_REASONS = [
  PUSH_NOT_REGISTERED, // providers/index.ts:68
  'Push provider is not configured', // providers/index.ts:63
  SMS_NO_PHONE_NUMBER, // reminders.ts, when the account saved no number
  'Twilio sender or auth token is not configured', // providers/index.ts:43
] as const;

export function isPermanentFailure(reason?: string | null): boolean {
  return Boolean(reason && (PERMANENT_FAILURE_REASONS as readonly string[]).includes(reason));
}

const DELIVERED: ReadonlyArray<Attempt['status']> = ['SENT', 'DELIVERED', 'OPENED'];

const deliveries = (attempts: Attempt[]) => attempts.filter((attempt) => DELIVERED.includes(attempt.status));
const failures = (attempts: Attempt[], channel: Channel) =>
  attempts.filter((attempt) => attempt.channel === channel && attempt.status === 'FAILED');

/** A channel is finished once it has delivered, failed permanently, or used up its retries. */
export function channelFinished(attempts: Attempt[], channel: Channel): boolean {
  const failed = failures(attempts, channel);
  return deliveries(attempts).some((attempt) => attempt.channel === channel)
    || failed.some((attempt) => isPermanentFailure(attempt.failureReason))
    || !shouldRetry('FAILED', failed.length, MAX_CHANNEL_RETRIES);
}

/** A transient failure waits out its backoff before the same channel is tried again. */
function waiting(attempts: Attempt[], channel: Channel, now: Date): boolean {
  const failed = failures(attempts, channel);
  if (!failed.length) return false;
  const last = failed.reduce((a, b) => (+a.createdAt >= +b.createdAt ? a : b));
  return now.getTime() - last.createdAt.getTime() < backoffMs(failed.length);
}

export function nextEscalationChannel(prefs: EscalationPrefs, attempts: Attempt[], now = new Date()): Channel | null {
  if (attempts.some((attempt) => attempt.status === 'OPENED')) return null;
  const usable = (channel: Channel, enabled: boolean) => enabled && !channelFinished(attempts, channel);

  // Push still goes first for every account it works for; only a finished push channel is skipped.
  if (usable('push', prefs.pushEnabled)) return waiting(attempts, 'push', now) ? null : 'push';

  // Escalation is timed from the first notice that actually went out. When none did — push was never
  // enabled, or could never be delivered — nothing is holding the fallback back, so it goes this tick.
  const delivered = deliveries(attempts);
  const firstDelivered = delivered[0]?.sentAt ?? delivered[0]?.createdAt;
  const elapsed = firstDelivered ? (now.getTime() - firstDelivered.getTime()) / 60000 : Number.POSITIVE_INFINITY;

  if (usable('email', prefs.emailEnabled) && elapsed >= prefs.escalateToEmailMinutes) {
    return waiting(attempts, 'email', now) ? null : 'email';
  }
  if (usable('sms', prefs.smsEnabled && prefs.critical) && elapsed >= prefs.escalateToSmsMinutes) {
    return waiting(attempts, 'sms', now) ? null : 'sms';
  }
  return null;
}

/** Whether any notice actually reached the user, by any channel. */
export function anyDelivered(attempts: Attempt[]): boolean {
  return deliveries(attempts).length > 0;
}

/**
 * No channel can produce a further notice, so the reminder is over. Distinguishes "nothing left to
 * try" from the `null` that `nextEscalationChannel` also returns while a backoff is running, which
 * must not end the reminder.
 */
export function escalationExhausted(prefs: EscalationPrefs, attempts: Attempt[]): boolean {
  if (attempts.some((attempt) => attempt.status === 'OPENED')) return true;
  const channels: Array<[Channel, boolean]> = [
    ['push', prefs.pushEnabled],
    ['email', prefs.emailEnabled],
    ['sms', prefs.smsEnabled && prefs.critical],
  ];
  return channels.every(([channel, enabled]) => !enabled || channelFinished(attempts, channel));
}

/** True while this channel has retries left. `retryCount` is the number of failures so far. */
export function shouldRetry(status: Attempt['status'], retryCount: number, max = MAX_CHANNEL_RETRIES) {
  return (status === 'FAILED' || status === 'RETRYING') && retryCount < max;
}

export function backoffMs(retryCount: number) {
  return Math.min(30 * 60 * 1000, 1000 * 2 ** retryCount);
}
