import { describe, expect, it } from 'vitest';
import { backoffMs, nextEscalationChannel, shouldRetry } from './escalation';

const prefs = {
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: true,
  escalateToEmailMinutes: 15,
  escalateToSmsMinutes: 45,
  critical: true,
};

describe('notification escalation', () => {
  it('starts with push', () => {
    expect(nextEscalationChannel(prefs, [])).toBe('push');
  });

  it('escalates to email after the configured delay', () => {
    const sentAt = new Date('2026-09-04T17:00:00.000Z');
    const now = new Date('2026-09-04T17:16:00.000Z');
    expect(nextEscalationChannel(prefs, [{ channel: 'push', status: 'SENT', createdAt: sentAt, sentAt }], now)).toBe('email');
  });

  it('sends SMS only for critical unacknowledged work', () => {
    const sentAt = new Date('2026-09-04T17:00:00.000Z');
    const now = new Date('2026-09-04T17:50:00.000Z');
    const attempts = [
      { channel: 'push' as const, status: 'SENT' as const, createdAt: sentAt, sentAt },
      { channel: 'email' as const, status: 'SENT' as const, createdAt: sentAt, sentAt },
    ];
    expect(nextEscalationChannel({ ...prefs, critical: false }, attempts, now)).toBeNull();
    expect(nextEscalationChannel(prefs, attempts, now)).toBe('sms');
  });

  it('stops after acknowledgement and retries failures', () => {
    expect(nextEscalationChannel(prefs, [{ channel: 'push', status: 'OPENED', createdAt: new Date() }])).toBeNull();
    expect(shouldRetry('FAILED', 2)).toBe(true);
    expect(backoffMs(3)).toBe(8000);
  });
});
