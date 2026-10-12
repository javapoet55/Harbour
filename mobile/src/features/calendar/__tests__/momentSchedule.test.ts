import type { ImportantMoment } from '../../../api/moments';
import type { CalendarEvent } from '../../../api/types';
import { eventOccursOn } from '../../../lib/todaySchedule';
import { calendarKey, calendarMonth } from '../../../lib/calendarDates';
import { DEFAULT_TASK_QUERY, snapshot } from '../../../lib/taskQuery';
import { buildCalendarDayIndex } from '../dayIndex';
import { isMomentEntry, momentEvents, momentIdFromEntry, momentOccursOn, momentTasks } from '../momentSchedule';

/**
 * The cases are Swift's own: ios/Tests/NexdoCoreTests/MomentScheduleTests.swift and
 * CalendarDayIndexTests.swift (bb57e09).
 */

function scheduledMoment(day: string, yearly = true): ImportantMoment {
  return {
    id: 'birthday:person',
    type: 'birthday',
    title: 'Alex’s birthday',
    firstName: 'Alex',
    phone: '',
    email: '',
    occurrenceDate: day,
    nextOccurrence: day,
    timeZoneID: 'Asia/Tokyo',
    source: 'manual',
    sourceKey: 'test',
    yearly,
    enabled: true,
    drafts: [],
  };
}

const LA = 'America/Los_Angeles';

describe('MomentSchedule', () => {
  // momentsAppearOnTheirCalendarDateAndNotTheReminderDate (:10-22)
  it('puts a moment on its calendar date, not its reminder date', () => {
    const moment = scheduledMoment('1990-10-09');
    const events = momentEvents([moment], ['2026-10-08', '2026-10-09', '2026-10-10'], LA);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.allDay).toBe(true);
    expect(eventOccursOn(event, '2026-10-09', LA)).toBe(true);
    expect(eventOccursOn(event, '2026-10-10', LA)).toBe(false);
    expect(momentIdFromEntry(event.id)).toBe(moment.id);
    expect(momentIdFromEntry('ordinary-task')).toBeNull();
    const index = buildCalendarDayIndex({ days: ['2026-10-09'], timeZone: LA, tasks: [], events });
    expect(index.events['2026-10-09']).toHaveLength(1);
  });

  it('builds the event Swift builds: midnight to midnight in the profile zone', () => {
    const [event] = momentEvents([scheduledMoment('1990-10-09')], ['2026-10-09'], LA);
    expect(event).toEqual({
      id: 'moment:birthday:person:2026-10-09',
      title: 'Alex’s birthday',
      startAt: '2026-10-09T07:00:00Z',
      endAt: '2026-10-10T07:00:00Z',
      allDay: true,
      notes: 'Birthday · Moment',
      location: null,
      timeZone: LA,
      source: 'moment',
      connectionId: null,
      completedAt: null,
    });
    expect(isMomentEntry(event.id)).toBe(true);
    // An id with a colon in it survives the round trip: only the day suffix is dropped.
    expect(momentIdFromEntry('moment:a:b:2026-10-09')).toBe('a:b');
    expect(momentIdFromEntry('moment:2026-10-09')).toBeNull();
  });

  // momentsRespectRecurrenceArchivesAndDisabledState (:24-36)
  it('respects recurrence, the leap day, archives and the off switch', () => {
    const moment = scheduledMoment('2000-02-29');
    expect(momentOccursOn(moment, '2027-02-28')).toBe(true);
    expect(momentOccursOn(moment, '2028-02-28')).toBe(false);
    expect(momentOccursOn(moment, '2028-02-29')).toBe(true);
    expect(momentOccursOn({ ...moment, enabled: false }, '2028-02-29')).toBe(false);
    expect(momentOccursOn({ ...moment, festivalSettings: '{"archived":true}' }, '2028-02-29')).toBe(false);
    expect(momentOccursOn(scheduledMoment('2026-10-09', false), '2027-10-09')).toBe(false);
    expect(momentOccursOn(scheduledMoment('2026-10-09', false), '2026-10-09')).toBe(true);
  });

  // momentTaskProjectionUsesExistingDayFiltersWithoutDuplicates (:38-52)
  it('projects tasks the existing date pills place, without duplicates', () => {
    const moment = scheduledMoment('1990-10-09');
    const now = Date.parse('2026-10-09T16:00:00Z');
    const entries = momentTasks([moment], LA, now);
    const today = snapshot(DEFAULT_TASK_QUERY, entries, LA, now);
    expect(today.tasks).toHaveLength(1);
    expect(today.counts.Today).toBe(1);
    expect(today.counts.Tomorrow).toBe(0);
    expect(today.tasks[0].durationMin).toBe(0);
    expect(snapshot({ ...DEFAULT_TASK_QUERY, status: 'Completed' }, entries, LA, now).tasks).toEqual([]);
    expect(snapshot({ ...DEFAULT_TASK_QUERY, status: 'Open', search: 'Alex' }, entries, LA, now).tasks).toHaveLength(1);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it('keeps last year’s occurrence and the next one for a yearly moment', () => {
    const now = Date.parse('2026-01-05T16:00:00Z');
    expect(momentTasks([scheduledMoment('1990-12-20')], LA, now).map((task) => task.id)).toEqual([
      'moment:birthday:person:2025-12-20',
      'moment:birthday:person:2026-12-20',
    ]);
    expect(momentTasks([{ ...scheduledMoment('1990-12-20'), enabled: false }], LA, now)).toEqual([]);
  });
});

describe('CalendarDayIndex', () => {
  const days = calendarMonth(Date.parse('2026-03-08T12:00:00Z'), LA).map((at) => calendarKey(at, LA));
  const deviceEvent = (overrides: Partial<CalendarEvent>): CalendarEvent => ({ id: 'x', title: 'x', startAt: '', endAt: '', source: 'apple-device', timeZone: LA, connectionId: null, completedAt: null, ...overrides });
  const allDay = deviceEvent({ id: 'all-day', title: 'Trip', startAt: '2026-03-07T08:00:00Z', endAt: '2026-03-09T07:00:00Z', allDay: true });
  const timed = deviceEvent({ id: 'timed', title: 'Meeting', startAt: '2026-03-08T07:00:00Z', endAt: '2026-03-08T08:00:00Z', allDay: false });
  const task = { id: 'task', title: 'Task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, startAt: '2026-03-08T17:00:00Z', dueAt: '2026-03-08T20:00:00Z' };

  // calendarIndexMatchesExistingDateRules (:5-27)
  it.each([LA, 'Asia/Tokyo'])('files events and tasks by the existing rules in %s', (zone) => {
    const index = buildCalendarDayIndex({ days, timeZone: zone, tasks: [task], events: [allDay, timed] });
    for (const day of days) {
      expect((index.events[day] ?? []).filter((event) => event.id === 'timed').length).toBe(eventOccursOn(timed, day, zone) ? 1 : 0);
    }
    // The device all-day trip keeps its own dates (the 7th and 8th) in every profile zone.
    expect(days.filter((day) => (index.events[day] ?? []).some((event) => event.id === 'all-day'))).toEqual(['2026-03-07', '2026-03-08']);
    expect(Object.values(index.tasks).every((list) => list.length === 1)).toBe(true);
  });

  // populatedMonthCanBeIndexedWithoutBlockingDateSelection (:29-45)
  it('indexes a 2,000-event month, then answers every date by lookup', () => {
    const first = Date.parse('2026-10-01T16:00:00Z');
    const events = Array.from({ length: 2000 }, (_, i) =>
      deviceEvent({ id: String(i), title: `Event ${i}`, startAt: new Date(first + (i % 31) * 86_400_000).toISOString(), endAt: new Date(first + (i % 31) * 86_400_000 + 3_600_000).toISOString(), allDay: false }),
    );
    const month = calendarMonth(first, LA).map((at) => calendarKey(at, LA));
    const started = Date.now();
    const index = buildCalendarDayIndex({ days: month, timeZone: LA, tasks: [], events });
    expect(Object.values(index.events).reduce((sum, list) => sum + list.length, 0)).toBe(events.length);
    for (let pass = 0; pass < 100; pass++) for (const day of month) void index.events[day]?.length;
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('files a task once when its start and due fall on the same day, and skips days outside the range', () => {
    const index = buildCalendarDayIndex({ days: ['2026-03-08'], timeZone: LA, tasks: [task, { ...task, id: 'later', startAt: '2026-04-01T17:00:00Z', dueAt: null }], events: [] });
    expect(index.tasks).toEqual({ '2026-03-08': [task] });
  });
});
