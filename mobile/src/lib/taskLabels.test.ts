import type { NexdoTask } from '../api/types';
import { DISTANT_FUTURE, startOfDay } from './taskQuery';
import { lifeReminderLabel, scheduleLabel, sectionTitle, serverTime, taskSubtitle } from './taskLabels';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata (a Wednesday). */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> = {}): NexdoTask {
  return { id: 't1', title: 'A task', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30, ...overrides };
}

describe('serverTime', () => {
  it('formats in the account zone, not the device zone', () => {
    expect(serverTime('2026-09-16T03:30:00.000Z', ZONE)).toBe('9:00 AM');
  });

  it('accepts fractional seconds', () => {
    expect(serverTime('2026-09-16T03:30:00.123Z', ZONE)).toBe('9:00 AM');
  });

  it('reports an unparseable value rather than throwing', () => {
    expect(serverTime('not a date', ZONE)).toBe('Time unavailable');
  });
});

describe('sectionTitle', () => {
  it('names today, yesterday and tomorrow', () => {
    const today = startOfDay(NOW, ZONE);
    expect(sectionTitle(today, ZONE, NOW)).toBe('Today');
    expect(sectionTitle(startOfDay(today - 3_600_000, ZONE), ZONE, NOW)).toBe('Yesterday');
    expect(sectionTitle(startOfDay(today + 90_000_000, ZONE), ZONE, NOW)).toBe('Tomorrow');
  });

  it('uses the weekday and date for any other day', () => {
    const friday = startOfDay(Date.parse('2026-09-18T06:00:00.000Z'), ZONE);
    expect(sectionTitle(friday, ZONE, NOW)).toBe('Friday, Sep 18');
  });

  it('labels the distant-future section Unscheduled', () => {
    expect(sectionTitle(DISTANT_FUTURE, ZONE, NOW)).toBe('Unscheduled');
  });
});

describe('taskSubtitle', () => {
  it('joins the time and the estimate with a middle dot', () => {
    expect(taskSubtitle(task({ startAt: '2026-09-16T03:30:00.000Z' }), ZONE)).toBe('9:00 AM · 30 min');
  });

  it('reads a whole number of hours as hours', () => {
    expect(taskSubtitle(task({ startAt: '2026-09-16T03:30:00.000Z', durationMin: 120 }), ZONE)).toBe('9:00 AM · 2 hr');
  });

  it('says Unscheduled when there is no date', () => {
    expect(taskSubtitle(task(), ZONE)).toBe('Unscheduled · 30 min');
  });

  it('omits a zero estimate', () => {
    expect(taskSubtitle(task({ durationMin: 0 }), ZONE)).toBe('Unscheduled');
  });

  it("prefers the task's own zone over the account zone", () => {
    const withZone = task({ startAt: '2026-09-16T03:30:00.000Z', timeZone: 'UTC' });
    expect(taskSubtitle(withZone, ZONE)).toBe('3:30 AM · 30 min');
  });

  it('falls back to dueAt when there is no startAt', () => {
    expect(taskSubtitle(task({ dueAt: '2026-09-16T03:30:00.000Z' }), ZONE)).toBe('9:00 AM · 30 min');
  });
});

describe('scheduleLabel', () => {
  it('is null for an unscheduled task, so the badge is not drawn', () => {
    expect(scheduleLabel(task(), ZONE)).toBeNull();
  });

  it('is the time for a scheduled task', () => {
    expect(scheduleLabel(task({ startAt: '2026-09-16T03:30:00.000Z' }), ZONE)).toBe('9:00 AM');
  });
});

describe('lifeReminderLabel', () => {
  it('names every server life-reminder type as Swift does', () => {
    const labels = ['returnItem', 'bill', 'expiration', 'maintenance', 'subscription', 'renewal', 'general'].map((type) =>
      lifeReminderLabel(task({ lifeReminderType: type })),
    );
    expect(labels).toEqual(['Return', 'Bill', 'Expires', 'Maintenance', 'Subscription', 'Renewal', 'Reminder']);
  });

  it('is null for an ordinary task and for a type this build does not know', () => {
    expect(lifeReminderLabel(task())).toBeNull();
    expect(lifeReminderLabel(task({ lifeReminderType: null }))).toBeNull();
    expect(lifeReminderLabel(task({ lifeReminderType: 'warranty' }))).toBeNull();
  });
});
