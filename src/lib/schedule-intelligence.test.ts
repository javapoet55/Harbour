import { describe, expect, it } from 'vitest';
import { analyzeSchedule, scoreTasks, type IntelligenceTask } from './schedule-intelligence';

const now = new Date('2026-03-08T16:00:00Z'); // DST transition day in America/Los_Angeles
const base = { timeZone: 'America/Los_Angeles', workStart: '09:00', workEnd: '17:00', now };
const event = (id: string, start: string, end: string, allDay = false) => ({ id, title: id, startAt: new Date(start), endAt: new Date(end), allDay });
const task = (id: string, values: Partial<IntelligenceTask> = {}) => ({ id, title: id, status: 'PLANNED', priority: 'HIGH', startAt: null, dueAt: new Date('2026-03-09T23:00:00Z'), durationMin: 60, ...values });

describe('schedule intelligence', () => {
  it('finds overlapping fixed calendar events', () => {
    const result = analyzeSchedule({ ...base, events: [event('Dentist', '2026-03-09T17:00:00Z', '2026-03-09T18:00:00Z'), event('Meeting', '2026-03-09T17:30:00Z', '2026-03-09T18:30:00Z')], tasks: [] });
    expect(result.conflicts.some((conflict) => conflict.type === 'HARD')).toBe(true);
  });
  it('finds insufficient buffers between back-to-back events', () => {
    const result = analyzeSchedule({ ...base, events: [event('Dentist', '2026-03-09T17:00:00Z', '2026-03-09T18:00:00Z'), event('Meeting', '2026-03-09T18:05:00Z', '2026-03-09T19:00:00Z')], tasks: [] });
    expect(result.conflicts.some((conflict) => conflict.type === 'BUFFER')).toBe(true);
  });
  it('flags high-priority workload that cannot fit in remaining time', () => {
    const current = new Date('2026-03-09T22:30:00Z');
    const result = analyzeSchedule({ ...base, now: current, events: [], tasks: [task('Proposal', { dueAt: new Date('2026-03-09T23:00:00Z'), durationMin: 90 })] });
    expect(result.conflicts.find((conflict) => conflict.type === 'WORKLOAD')?.explanation).toContain('only 30 minutes');
  });
  it('ignores all-day events for timed overlap and preserves an empty schedule', () => {
    const result = analyzeSchedule({ ...base, events: [event('Holiday', '2026-03-09T08:00:00Z', '2026-03-10T08:00:00Z', true)], tasks: [] });
    expect(result.conflicts).toEqual([]);
    expect(result.availableMinutes).toBeGreaterThanOrEqual(0);
  });
  it('does not rank completed work as actionable and prioritizes overdue work', () => {
    const scores = scoreTasks([task('Done', { status: 'COMPLETED' }), task('Late', { dueAt: new Date('2026-03-07T20:00:00Z') })], now);
    expect(scores).toHaveLength(1);
    expect(scores[0].title).toBe('Late');
  });
});

describe('Today snapshot', () => {
  const morning = { ...base, now: new Date('2026-09-07T14:30:00Z'), bufferMinutes: 0 };
  const at = (hour: string) => new Date(`2026-09-07T${hour}:00-07:00`);
  const appointment = (title: string, start: string, end: string) => ({ id: title, title, startAt: at(start), endAt: at(end) });

  it('brings eight commitments, an overlap and a real 2 PM deadline shortfall into one snapshot', () => {
    const result = analyzeSchedule({ ...morning, events: [
      appointment('Engineering leadership', '09:00', '10:00'),
      appointment('11 AM meeting', '11:00', '11:40'),
      appointment('Dentist', '11:30', '12:30'),
      appointment('Project review', '14:00', '15:00'),
    ], tasks: [
      task('Presentation', { priority: 'CRITICAL', dueAt: at('14:00'), durationMin: 90 }),
      task('Personal admin', { priority: 'LOW', startAt: at('10:00'), dueAt: null, durationMin: 60 }),
      task('Organize notes', { priority: 'LOW', startAt: at('12:30'), dueAt: null, durationMin: 60 }),
      task('Team follow-up', { startAt: at('15:00'), dueAt: null, durationMin: 60 }),
    ] });
    expect(result.today).toMatchObject({ commitments: 8, appointments: 4, tasks: 4 });
    expect(result.today.attention).toHaveLength(3);
    expect(result.today.attention.find((item) => item.label === 'Schedule check')?.explanation).toContain('90 minutes by 2:00 PM, but only 30 minutes');
    expect(result.today.attention.find((item) => item.label === 'Schedule check')).toMatchObject({ taskIds: ['Presentation'], requiredMinutes: 90, deadlineAt: at('14:00').toISOString() });
    expect(result.today.recommendation.explanation).toContain('If Organize notes can move');
    expect(result.today.recommendation.explanation).toContain('12:30 PM–2:00 PM');
    expect(result.today.recommendation.additionalAdvice).toContain('calendar');
  });

  it('finds nested overlaps and does not double-subtract busy time', () => {
    const result = analyzeSchedule({ ...morning, tasks: [], events: [appointment('Long meeting', '09:00', '12:00'), appointment('Short meeting', '09:30', '10:00'), appointment('Dentist', '11:00', '11:30')] });
    expect(result.conflicts.filter((item) => item.type === 'HARD')).toHaveLength(2);
    expect(result.availableMinutes).toBe(300);
  });

  it('counts past appointments for the day but does not report resolved overlaps', () => {
    const result = analyzeSchedule({ ...morning, now: at('13:00'), tasks: [], events: [appointment('Meeting', '09:00', '10:00'), appointment('Dentist', '09:30', '10:30')] });
    expect(result.today.commitments).toBe(2);
    expect(result.today.timeline.every((item) => item.past)).toBe(true);
    expect(result.today.attention).toEqual([]);
    expect(result.availableMinutes).toBe(240);
  });

  it('deduplicates calendar mirrors and excludes completed and cancelled work', () => {
    const mirror = { ...appointment('Task mirror', '10:00', '11:00'), externalId: 'external-1' };
    const result = analyzeSchedule({ ...morning, events: [mirror, appointment('Completed mirror', '11:00', '12:00')], tasks: [
      task('Focus task', { startAt: at('10:00'), dueAt: at('14:00'), externalEventId: 'external-1' }),
      task('Done', { status: 'COMPLETED', startAt: at('11:00'), calendarEventId: 'Completed mirror' }),
      task('Cancelled', { status: 'CANCELLED', dueAt: at('14:00') }),
    ] });
    expect(result.today).toMatchObject({ commitments: 1, appointments: 0, tasks: 1, availableMinutes: 420 });
    expect(result.conflicts).toEqual([]);
  });

  it('reserves all-day appointments and does not suggest a focus block through them', () => {
    const result = analyzeSchedule({ ...morning, events: [{ ...appointment('Day off', '00:00', '23:59'), allDay: true }], tasks: [task('Presentation', { dueAt: at('14:00') })] });
    expect(result.availableMinutes).toBe(0);
    expect(result.today.commitments).toBe(2);
    expect(result.today.recommendation.startAt).toBeUndefined();
    expect(result.today.attention.some((item) => item.label === 'Schedule check')).toBe(true);
  });

  it('uses the transition buffer both for warnings and for finding a free focus slot', () => {
    const result = analyzeSchedule({ ...morning, bufferMinutes: 30, events: [appointment('Meeting', '09:00', '10:00'), appointment('Dentist', '10:15', '11:00')], tasks: [task('Presentation', { dueAt: at('14:00') })] });
    expect(result.conflicts.find((item) => item.type === 'BUFFER')?.explanation).toContain('assumed 30-minute buffer');
    expect(result.today.recommendation.startAt).toBe(at('11:30').toISOString());
    expect(result.today.recommendation.endAt).toBe(at('12:30').toISOString());
  });

  it('detects cumulative workload when either task alone would fit', () => {
    const result = analyzeSchedule({ ...morning, now: at('13:00'), events: [], tasks: [task('A', { dueAt: at('14:00'), durationMin: 45 }), task('B', { dueAt: at('14:00'), durationMin: 45 })] });
    expect(result.conflicts.find((item) => item.type === 'WORKLOAD')?.explanation).toContain('90 minutes by 2:00 PM, but only 60 minutes');
  });

  it('does not allocate a task on top of another task or beyond its deadline', () => {
    const result = analyzeSchedule({ ...morning, now: at('12:30'), events: [], tasks: [task('Presentation', { dueAt: at('14:00') }), task('Reserved', { priority: 'CRITICAL', startAt: at('12:30'), dueAt: null })] });
    expect(result.today.attention.some((item) => item.label === 'Schedule check')).toBe(true);
    expect(result.today.recommendation.startAt).toBeUndefined();
  });

  it('handles an empty day, weekends and the end of working hours', () => {
    const empty = analyzeSchedule({ ...morning, tasks: [], events: [] });
    expect(empty.today).toMatchObject({ commitments: 0, availableMinutes: 480, attention: [] });
    const weekend = analyzeSchedule({ ...morning, now: new Date('2026-09-05T14:30:00Z'), tasks: [], events: [] });
    expect(weekend.today).toMatchObject({ workingToday: false, availableMinutes: 0 });
    expect(analyzeSchedule({ ...morning, now: at('20:00'), tasks: [], events: [] }).availableMinutes).toBe(0);
  });

  it.each([
    ['2026-03-08T08:00:00Z', 180],
    ['2026-11-01T07:00:00Z', 300],
  ])('measures real available minutes across DST: %s', (instant, minutes) => {
    const result = analyzeSchedule({ ...morning, now: new Date(instant), workingDays: '0', workStart: '00:00', workEnd: '04:00', tasks: [], events: [] });
    expect(result.availableMinutes).toBe(minutes);
  });

  it('keeps overdue and dependency-blocked work visible without recommending blocked work', () => {
    const result = analyzeSchedule({ ...morning, events: [], tasks: [task('Waiting', { dueAt: at('14:00'), dependencyBlocked: true }), task('Overdue', { dueAt: new Date('2026-09-06T20:00:00Z') })] });
    expect(result.today.overdue).toBe(1);
    expect(result.today.attention.map((item) => item.label)).toEqual(expect.arrayContaining(['Overdue', 'Blocked']));
    expect(result.today.topPriority?.title).toBe('Overdue');
    expect(result.today.recommendation.taskId).not.toBe('Waiting');
  });

  it('generates suggestions without changing the supplied schedule', () => {
    const input = { ...morning, events: [appointment('Meeting', '09:00', '10:00')], tasks: [task('Presentation', { startAt: at('09:30'), dueAt: at('14:00') })] };
    const before = JSON.stringify(input);
    const result = analyzeSchedule(input);
    expect(result.today.attention.some((item) => item.label === 'Conflict')).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });
});
