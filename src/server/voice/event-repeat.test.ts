import { expect, it } from 'vitest';
import { eventOccurrences } from './event-repeat';
const start = new Date('2026-10-30T16:00:00Z'), end = new Date('2026-10-30T16:30:00Z');
it('keeps daily wall time across DST', () => {
  const result = eventOccurrences(start, end, 'America/Los_Angeles', { frequency: 'daily', until: '2026-11-02', weekdays: [] });
  expect(result).toHaveLength(4);
  expect(result[3].startAt.toISOString()).toBe('2026-11-02T17:00:00.000Z');
});
it('selects only chosen weekdays', () => {
  const result = eventOccurrences(start, end, 'America/Los_Angeles', { frequency: 'weekdays', until: '2026-11-06', weekdays: [1, 3] });
  expect(result.map(x => x.startAt.toISOString())).toEqual(['2026-11-02T17:00:00.000Z', '2026-11-04T17:00:00.000Z']);
});
it('weekly repeats on the original weekday', () => {
  expect(eventOccurrences(start, end, 'America/Los_Angeles', { frequency: 'weekly', until: '2026-11-06', weekdays: [] })).toHaveLength(2);
});
it('monthly skips months without the original date', () => {
  const result = eventOccurrences(new Date('2027-01-31T17:00:00Z'), new Date('2027-01-31T18:00:00Z'), 'America/Los_Angeles', { frequency: 'monthly', until: '2027-03-31', weekdays: [] });
  expect(result.map(x => x.startAt.toISOString())).toEqual(['2027-01-31T17:00:00.000Z', '2027-03-31T16:00:00.000Z']);
});
it('rejects empty weekday selection', () => {
  expect(() => eventOccurrences(start, end, 'America/Los_Angeles', { frequency: 'weekdays', until: '2026-11-06', weekdays: [] })).toThrow();
});
