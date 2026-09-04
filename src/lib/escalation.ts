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
};

export function nextEscalationChannel(prefs: EscalationPrefs, attempts: Attempt[], now = new Date()): Channel | null {
  const sent = attempts.filter((a) => a.status === 'SENT' || a.status === 'DELIVERED' || a.status === 'OPENED');
  const acknowledged = attempts.some((a) => a.status === 'OPENED');
  if (acknowledged) return null;

  const hasPush = sent.some((a) => a.channel === 'push');
  const hasEmail = sent.some((a) => a.channel === 'email');
  const hasSms = sent.some((a) => a.channel === 'sms');

  if (!hasPush && prefs.pushEnabled) return 'push';

  const firstSent = sent[0]?.sentAt ?? sent[0]?.createdAt;
  if (!firstSent) return prefs.pushEnabled ? 'push' : prefs.emailEnabled ? 'email' : null;
  const elapsed = (now.getTime() - firstSent.getTime()) / 60000;

  if (!hasEmail && prefs.emailEnabled && elapsed >= prefs.escalateToEmailMinutes) return 'email';
  if (!hasSms && prefs.smsEnabled && prefs.critical && elapsed >= prefs.escalateToSmsMinutes) return 'sms';
  return null;
}

export function shouldRetry(status: Attempt['status'], retryCount: number, max = 5) {
  return (status === 'FAILED' || status === 'RETRYING') && retryCount < max;
}

export function backoffMs(retryCount: number) {
  return Math.min(30 * 60 * 1000, 1000 * 2 ** retryCount);
}
