import { describe, expect, it } from 'vitest';
import { taskDueLabel, taskTimelineCondition, taskTimelineRange } from './task-timeline';

const zone = 'America/Los_Angeles';
const now = new Date('2026-09-05T20:00:00Z');

describe('task timeline filters', () => {
  it('uses the whole local day, including tasks due earlier today', () => {
    expect(taskTimelineRange('TODAY', zone, now)).toEqual({ gte: new Date('2026-09-05T07:00:00Z'), lt: new Date('2026-09-06T07:00:00Z') });
  });
  it('uses tomorrow’s local midnight boundaries, not the next 24 hours', () => {
    expect(taskTimelineRange('TOMORROW', zone, now)).toEqual({ gte: new Date('2026-09-06T07:00:00Z'), lt: new Date('2026-09-07T07:00:00Z') });
  });
  it('matches Calendar’s Monday–Sunday week across a month boundary', () => {
    expect(taskTimelineRange('THIS_WEEK', zone, now)).toEqual({ gte: new Date('2026-08-31T07:00:00Z'), lt: new Date('2026-09-07T07:00:00Z') });
  });
  it('keeps Sunday in the current week and starts a new week on Monday', () => {
    expect(taskTimelineRange('THIS_WEEK', zone, new Date('2026-09-07T06:59:59Z'))?.gte).toEqual(new Date('2026-08-31T07:00:00Z'));
    expect(taskTimelineRange('THIS_WEEK', zone, new Date('2026-09-07T07:00:00Z'))?.gte).toEqual(new Date('2026-09-07T07:00:00Z'));
  });
  it('handles year boundaries', () => {
    expect(taskTimelineRange('TOMORROW', zone, new Date('2026-12-31T23:00:00Z'))).toEqual({ gte: new Date('2027-01-01T08:00:00Z'), lt: new Date('2027-01-02T08:00:00Z') });
  });
  it.each([
    ['2026-03-08T18:00:00Z', '2026-03-08T08:00:00Z', '2026-03-09T07:00:00Z'],
    ['2026-11-01T18:00:00Z', '2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z'],
  ])('handles the short and long DST days: %s', (instant, start, end) => {
    expect(taskTimelineRange('TODAY', zone, new Date(instant))).toEqual({ gte: new Date(start), lt: new Date(end) });
  });
  it('uses the user’s date even when UTC is on a different day', () => {
    const instant = new Date('2026-09-06T02:00:00Z');
    expect(taskTimelineRange('TODAY', zone, instant)?.gte).toEqual(new Date('2026-09-05T07:00:00Z'));
    expect(taskTimelineRange('TODAY', 'Asia/Kolkata', instant)?.gte).toEqual(new Date('2026-09-05T18:30:00Z'));
  });
  it('leaves All and existing API callers unfiltered', () => {
    for (const value of ['ALL', null, 'unknown']) expect(taskTimelineCondition(value, zone, now)).toEqual({});
  });
  it('prioritizes due dates; only falls back to start when no deadline is set', () => {
    const range = taskTimelineRange('TODAY', zone, now);
    expect(taskTimelineCondition('TODAY', zone, now)).toEqual({ OR: [{ dueAt: range }, { dueAt: null, startAt: range }] });
  });
});

describe('compact task row dates', () => {
  it('formats today’s due time in the saved time zone', () => {
    expect(taskDueLabel({ dueAt: '2026-09-05T23:36:00Z', startAt: null }, zone, now)).toBe('Due 4:36 PM');
  });
  it('shows a date for other days and distinguishes scheduled-only and undated work', () => {
    expect(taskDueLabel({ dueAt: '2026-09-06T16:00:00Z', startAt: null }, zone, now)).toBe('Due Sep 6, 9:00 AM');
    expect(taskDueLabel({ dueAt: null, startAt: '2026-09-05T23:36:00Z' }, zone, now)).toBe('Scheduled 4:36 PM');
    expect(taskDueLabel({ dueAt: null, startAt: null }, zone, now)).toBe('No date');
  });
});
