import { describe, expect, it, vi } from 'vitest';
vi.mock('@/server/db', () => ({ prisma: {} }));
import { callOutcome, noticeOutcome } from './reminder-history';

const NOW = new Date('2026-11-21T17:00:00Z');
const later = new Date(NOW.getTime() + 3600_000), earlier = new Date(NOW.getTime() - 3600_000);
const rem = (over: object = {}) => ({ status: 'SCHEDULED', generation: 1, fireAt: earlier, attempts: [] as { channel: string; status: string; generation: number }[], ...over });

describe('noticeOutcome', () => {
  it('reads the current generation only', () => {
    expect(noticeOutcome('push', rem({ fireAt: later }), NOW)).toBe('scheduled');
    expect(noticeOutcome('push', rem({ status: 'QUEUED', attempts: [{ channel: 'push', status: 'SENT', generation: 1 }] }), NOW)).toBe('sent');
    expect(noticeOutcome('email', rem({ status: 'QUEUED', attempts: [{ channel: 'push', status: 'SENT', generation: 1 }] }), NOW)).toBe('sending');
    expect(noticeOutcome('push', rem({ attempts: [{ channel: 'push', status: 'SENT', generation: 0 }] }), NOW)).toBe('sending');
    expect(noticeOutcome('push', rem({ status: 'FAILED', attempts: [{ channel: 'push', status: 'FAILED', generation: 1 }] }), NOW)).toBe('failed');
    expect(noticeOutcome('email', rem({ status: 'EXPIRED' }), NOW)).toBe('skipped');
    expect(noticeOutcome('email', rem({ status: 'CANCELLED' }), NOW)).toBe('cancelled');
    expect(noticeOutcome('email', null, NOW)).toBe('skipped');
  });
});

describe('callOutcome', () => {
  it('uses the calls for the current reminder time, latest attempt first', () => {
    expect(callOutcome([], later, NOW, false)).toBe('scheduled');
    expect(callOutcome([{ fireAt: earlier, attempt: 1, status: 'COMPLETED' }], earlier, NOW, true)).toBe('answered');
    expect(callOutcome([{ fireAt: earlier, attempt: 1, status: 'MISSED' }, { fireAt: earlier, attempt: 2, status: 'QUEUED' }], earlier, NOW, false)).toBe('missed');
    expect(callOutcome([{ fireAt: earlier, attempt: 1, status: 'MISSED' }, { fireAt: earlier, attempt: 2, status: 'VOICEMAIL' }], earlier, NOW, false)).toBe('voicemail');
    expect(callOutcome([{ fireAt: earlier, attempt: 1, status: 'DIALING' }], earlier, NOW, false)).toBe('sending');
    expect(callOutcome([{ fireAt: earlier, attempt: 1, status: 'COMPLETED' }], later, NOW, false)).toBe('scheduled');
    expect(callOutcome([], earlier, NOW, true)).toBe('cancelled');
  });
});
