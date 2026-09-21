import { describe, expect, it } from 'vitest';
import { lifeReminderUrgency, parseLifeReminder } from './life-reminders';

const zone = 'America/Los_Angeles';
const now = new Date('2026-09-19T18:00:00Z');

describe('smart life reminder parsing', () => {
  it('parses a relative return deadline', () => {
    const value = parseLifeReminder('Remind me in 25 days to return these shoes.', zone, now);
    expect(value.reminderType).toBe('returnItem');
    expect(value.title).toBe('Return these shoes');
    expect(value.dueDate?.toISOString()).toBe('2026-10-14T16:00:00.000Z');
  });
  it('parses a monthly bill on its specified day', () => {
    const value = parseLifeReminder('Pay electricity bill on the 20th every month.', zone, now);
    expect(value.reminderType).toBe('bill');
    expect(value.recurrenceRule).toEqual({ frequency: 'MONTHLY', interval: 1 });
    expect(value.dueDate?.toISOString()).toBe('2026-09-20T16:00:00.000Z');
  });
  it('parses maintenance every three months using calendar arithmetic', () => {
    const value = parseLifeReminder('Replace AC filter every 3 months.', zone, now);
    expect(value.reminderType).toBe('maintenance');
    expect(value.recurrenceRule).toEqual({ frequency: 'MONTHLY', interval: 3 });
    expect(value.dueDate?.toISOString()).toBe('2026-12-19T17:00:00.000Z');
  });
  it('keeps an expiration deadline and calculates its earlier reminder', () => {
    const value = parseLifeReminder('My car registration expires November 15. Remind me two weeks before.', zone, now);
    expect(value.reminderType).toBe('renewal');
    expect(value.title).toBe('Renew vehicle registration');
    expect(value.dueDate?.toISOString()).toBe('2026-11-15T17:00:00.000Z');
    expect(value.reminderDate?.toISOString()).toBe('2026-11-01T17:00:00.000Z');
  });
  it('parses a subscription cancellation deadline', () => {
    const value = parseLifeReminder('Cancel my trial before October 3.', zone, now);
    expect(value.reminderType).toBe('subscription');
    expect(value.dueDate?.toISOString()).toBe('2026-10-03T16:00:00.000Z');
  });
  it('uses local calendar days across DST and clamps month ends', () => {
    expect(parseLifeReminder('Remind me in 1 day to return it', zone, new Date('2026-03-07T18:00:00Z')).dueDate?.toISOString()).toBe('2026-03-08T16:00:00.000Z');
    expect(parseLifeReminder('Replace filter every 1 month', zone, new Date('2027-01-31T18:00:00Z')).dueDate?.toISOString()).toBe('2027-02-28T17:00:00.000Z');
  });
  it('falls back without blocking an ordinary task', () => {
    const value = parseLifeReminder('Write project outline', zone, now);
    expect(value.recognized).toBe(false);
    expect(value.dueDate).toBeNull();
  });
});

describe('life reminder urgency', () => {
  it('uses deterministic boundaries', () => {
    expect(lifeReminderUrgency(new Date(+now - 1), now)).toBe('overdue');
    expect(lifeReminderUrgency(new Date(+now + 86_400_000), now)).toBe('urgent');
    expect(lifeReminderUrgency(new Date(+now + 5 * 86_400_000), now)).toBe('soon');
    expect(lifeReminderUrgency(new Date(+now + 20 * 86_400_000), now)).toBe('upcoming');
    expect(lifeReminderUrgency(new Date(+now + 40 * 86_400_000), now)).toBe('normal');
  });
});
