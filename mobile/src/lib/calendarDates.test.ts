import type { CalendarEvent, NexdoTask } from '../api/types';
import {
  calendarEventMatches,
  calendarKey,
  calendarMonth,
  calendarOverdue,
  calendarSearchMatches,
  calendarWeek,
  itemCount,
  shiftSelected,
  taskOccursOn,
  taskScheduledOn,
  visibleDays,
} from './calendarDates';
import { calendarRows, rowSymbol, rowTone } from './calendarRows';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata (a Wednesday). */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return { title: 'An event', startAt: atLocal('2026-09-16', '10:00'), endAt: atLocal('2026-09-16', '11:00'), ...overrides };
}

/** A local wall time in the account zone. */
function atLocal(ymd: string, hm = '10:00'): string {
  const [hour, minute] = hm.split(':').map(Number);
  return new Date(Date.parse(`${ymd}T00:00:00.000Z`) - 5.5 * 3_600_000 + (hour * 60 + minute) * 60_000).toISOString();
}

const keys = (days: number[]) => days.map((day) => calendarKey(day, ZONE));

/** `CalendarSearch.matches` (CalendarDates.swift:3-8). */
describe('calendarSearchMatches', () => {
  it('matches everything for a blank query', () => {
    expect(calendarSearchMatches('Standup', '')).toBe(true);
    expect(calendarSearchMatches('Standup', '   ')).toBe(true);
  });

  it('is case- and diacritic-insensitive', () => {
    expect(calendarSearchMatches('Réservation', 'reserv')).toBe(true);
    expect(calendarSearchMatches('Standup', 'zzz')).toBe(false);
  });
});

/** `CalendarDates.week(_:)` (CalendarDates.swift:27-30). */
describe('calendarWeek', () => {
  it('runs MONDAY to Sunday', () => {
    expect(keys(calendarWeek(NOW, ZONE))).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
  });

  it('puts a Sunday at the END of its week', () => {
    const sunday = Date.parse('2026-09-20T06:00:00.000Z');
    expect(keys(calendarWeek(sunday, ZONE))[0]).toBe('2026-09-14');
    expect(keys(calendarWeek(sunday, ZONE))[6]).toBe('2026-09-20');
  });

  it('is stable on a Monday', () => {
    const monday = Date.parse('2026-09-14T06:00:00.000Z');
    expect(keys(calendarWeek(monday, ZONE))[0]).toBe('2026-09-14');
  });
});

/** `CalendarDates.month(_:)` (CalendarDates.swift:31-37). */
describe('calendarMonth', () => {
  it('is SUNDAY-first, unlike the week strip', () => {
    const grid = keys(calendarMonth(NOW, ZONE));
    // September 2026 starts on a Tuesday, so the grid opens on Sunday the 30th of August.
    expect(grid[0]).toBe('2026-08-30');
  });

  it('pads to whole weeks', () => {
    for (const month of ['2026-02-10', '2026-09-16', '2026-08-10']) {
      const grid = calendarMonth(Date.parse(`${month}T06:00:00.000Z`), ZONE);
      expect(grid.length % 7).toBe(0);
      expect(grid.length).toBeGreaterThanOrEqual(28);
      expect(grid.length).toBeLessThanOrEqual(42);
    }
  });

  it('covers every day of the month', () => {
    const grid = keys(calendarMonth(NOW, ZONE));
    expect(grid).toContain('2026-09-01');
    expect(grid).toContain('2026-09-30');
  });

  it('handles a February that starts on a Sunday with no padding at the front', () => {
    // 2026-02-01 is a Sunday.
    const grid = keys(calendarMonth(Date.parse('2026-02-10T06:00:00.000Z'), ZONE));
    expect(grid[0]).toBe('2026-02-01');
  });
});

/** `visibleDays` (CalendarView.swift:32-41). */
describe('visibleDays', () => {
  it('gives three days for the default schedule range, starting on the selected day', () => {
    expect(keys(visibleDays('Schedule', 'Next 3 days', NOW, ZONE))).toEqual(['2026-09-16', '2026-09-17', '2026-09-18']);
  });

  it('gives seven days for Next 7 days', () => {
    expect(visibleDays('Schedule', 'Next 7 days', NOW, ZONE)).toHaveLength(7);
  });

  it('uses the Monday-first week for "This week", even in Schedule mode', () => {
    expect(keys(visibleDays('Schedule', 'This week', NOW, ZONE))[0]).toBe('2026-09-14');
  });

  it('ignores the range in Week and Month mode', () => {
    expect(keys(visibleDays('Week', 'Next 3 days', NOW, ZONE))[0]).toBe('2026-09-14');
    expect(visibleDays('Month', 'Next 3 days', NOW, ZONE).length % 7).toBe(0);
  });
});

/** `shift(_:)` (CalendarView.swift:382-384). */
describe('shiftSelected', () => {
  it('moves a week in Week mode', () => {
    expect(calendarKey(shiftSelected('Week', NOW, 1, ZONE), ZONE)).toBe('2026-09-23');
    expect(calendarKey(shiftSelected('Week', NOW, -1, ZONE), ZONE)).toBe('2026-09-09');
  });

  it('moves a month in Month mode', () => {
    expect(calendarKey(shiftSelected('Month', NOW, 1, ZONE), ZONE)).toBe('2026-10-16');
    expect(calendarKey(shiftSelected('Month', NOW, -1, ZONE), ZONE)).toBe('2026-08-16');
  });

  it('clamps into a shorter month rather than rolling over', () => {
    const halloween = Date.parse('2026-10-31T06:00:00.000Z');
    expect(calendarKey(shiftSelected('Month', halloween, 1, ZONE), ZONE)).toBe('2026-11-30');
  });
});

/** `CalendarDates.taskOccurs` (CalendarDates.swift:38-41). */
describe('taskOccursOn', () => {
  it('matches on the start date OR the due date', () => {
    expect(taskOccursOn(task({ id: 'a', startAt: atLocal('2026-09-16') }), '2026-09-16', ZONE)).toBe(true);
    expect(taskOccursOn(task({ id: 'a', dueAt: atLocal('2026-09-16') }), '2026-09-16', ZONE)).toBe(true);
    expect(taskOccursOn(task({ id: 'a', startAt: atLocal('2026-09-17') }), '2026-09-16', ZONE)).toBe(false);
  });

  it('excludes cancelled tasks', () => {
    expect(taskOccursOn(task({ id: 'a', status: 'CANCELLED', startAt: atLocal('2026-09-16') }), '2026-09-16', ZONE)).toBe(false);
  });

  it('flips with completedOnly rather than filtering', () => {
    const open = task({ id: 'open', startAt: atLocal('2026-09-16') });
    const done = task({ id: 'done', status: 'COMPLETED', startAt: atLocal('2026-09-16') });

    expect(taskOccursOn(open, '2026-09-16', ZONE, false)).toBe(true);
    expect(taskOccursOn(done, '2026-09-16', ZONE, false)).toBe(false);
    expect(taskOccursOn(open, '2026-09-16', ZONE, true)).toBe(false);
    expect(taskOccursOn(done, '2026-09-16', ZONE, true)).toBe(true);
  });

  it('ignores a task with no dates at all', () => {
    expect(taskOccursOn(task({ id: 'a' }), '2026-09-16', ZONE)).toBe(false);
  });
});

/** `CalendarEventFilter.matches` (CalendarDates.swift:44-52). */
describe('calendarEventMatches', () => {
  const base = { day: '2026-09-16', timeZone: ZONE, now: NOW };

  it('keeps an event that occurs on the day', () => {
    expect(calendarEventMatches({ ...base, event: event({ id: 'e' }), completedOnly: false })).toBe(true);
  });

  it('rejects one on another day', () => {
    expect(
      calendarEventMatches({ ...base, event: event({ id: 'e', startAt: atLocal('2026-09-18'), endAt: atLocal('2026-09-18', '11:00') }), completedOnly: false }),
    ).toBe(false);
  });

  it('treats an event as complete only once its END has passed', () => {
    // Ends 08:00 local, before now (09:00).
    const past = event({ id: 'past', startAt: atLocal('2026-09-16', '07:00'), endAt: atLocal('2026-09-16', '08:00') });
    // Ends 11:00, still ahead.
    const ahead = event({ id: 'ahead' });

    expect(calendarEventMatches({ ...base, event: past, completedOnly: true })).toBe(true);
    expect(calendarEventMatches({ ...base, event: ahead, completedOnly: true })).toBe(false);
  });
});

/** `overdue(_:)` and `scheduled(_:_:)` (CalendarView.swift:46-49, 414). */
describe('calendarOverdue and taskScheduledOn', () => {
  it('is overdue only when the due DAY is before today', () => {
    expect(calendarOverdue(task({ id: 'a', dueAt: atLocal('2026-09-15') }), ZONE, NOW)).toBe(true);
    // Later today still counts as today, so not overdue.
    expect(calendarOverdue(task({ id: 'a', dueAt: atLocal('2026-09-16', '23:00') }), ZONE, NOW)).toBe(false);
  });

  it('is never overdue once complete', () => {
    expect(calendarOverdue(task({ id: 'a', status: 'COMPLETED', dueAt: atLocal('2026-09-01') }), ZONE, NOW)).toBe(false);
  });

  it('distinguishes a scheduled task from a due one', () => {
    expect(taskScheduledOn(task({ id: 'a', startAt: atLocal('2026-09-16') }), '2026-09-16', ZONE)).toBe(true);
    expect(taskScheduledOn(task({ id: 'a', dueAt: atLocal('2026-09-16') }), '2026-09-16', ZONE)).toBe(false);
  });
});

describe('itemCount', () => {
  it('singularises one item', () => {
    expect(itemCount(1)).toBe('1 item');
    expect(itemCount(0)).toBe('0 items');
    expect(itemCount(4)).toBe('4 items');
  });
});

/** `rows(_:)` (CalendarView.swift:415-434). */
describe('calendarRows', () => {
  const day = Date.parse(atLocal('2026-09-16', '12:00'));

  it('merges tasks and events into one list ordered by time', () => {
    const rows = calendarRows({
      tasks: [task({ id: 't1', title: 'Pack boxes', startAt: atLocal('2026-09-16', '14:00') })],
      events: [event({ id: 'e1', title: 'Standup', startAt: atLocal('2026-09-16', '09:30'), endAt: atLocal('2026-09-16', '10:00') })],
      day,
      timeZone: ZONE,
      now: NOW,
    });
    expect(rows.map((row) => row.title)).toEqual(['Standup', 'Pack boxes']);
  });

  it('labels a scheduled task with its duration and a deadline task with "Due"', () => {
    const rows = calendarRows({
      tasks: [
        task({ id: 'scheduled', startAt: atLocal('2026-09-16', '14:00') }),
        task({ id: 'due', dueAt: atLocal('2026-09-16', '17:00') }),
      ],
      events: [],
      day,
      timeZone: ZONE,
      now: NOW,
    });
    expect(rows[0]).toMatchObject({ time: '2:00 PM', detail: '30 min · Task' });
    expect(rows[1]).toMatchObject({ time: 'Due 5:00 PM', detail: 'Task deadline', deadline: true });
  });

  it('marks a repeating task in its detail line', () => {
    const [row] = calendarRows({
      tasks: [task({ id: 'r', startAt: atLocal('2026-09-16', '14:00'), recurrence: { frequency: 'WEEKLY', interval: 1 } })],
      events: [],
      day,
      timeZone: ZONE,
      now: NOW,
    });
    expect(row.detail).toBe('30 min · Task · Repeats');
  });

  it('reads an all-day event as "All day" and sorts it to midnight', () => {
    const rows = calendarRows({
      tasks: [task({ id: 't', startAt: atLocal('2026-09-16', '09:00') })],
      events: [event({ id: 'e', allDay: true, startAt: atLocal('2026-09-16', '00:00'), endAt: atLocal('2026-09-17', '00:00') })],
      day,
      timeZone: ZONE,
      now: NOW,
    });
    expect(rows[0]).toMatchObject({ time: 'All day', detail: 'Calendar event' });
  });

  it('clamps a multi-day event to the day being shown', () => {
    // Runs from the 15th at 22:00 to the 17th at 02:00; on the 16th it should fill the whole day.
    const [row] = calendarRows({
      tasks: [],
      events: [event({ id: 'e', startAt: atLocal('2026-09-15', '22:00'), endAt: atLocal('2026-09-17', '02:00') })],
      day,
      timeZone: ZONE,
      now: NOW,
    });
    expect(row.time).toBe('12:00 AM');
    expect(row.detail).toBe('1440 min · Event');
  });

  it('breaks a time tie by id, so the order is stable', () => {
    const rows = calendarRows({
      tasks: [task({ id: 'b', startAt: atLocal('2026-09-16', '09:00') })],
      events: [event({ id: 'a', startAt: atLocal('2026-09-16', '09:00'), endAt: atLocal('2026-09-16', '10:00') })],
      day,
      timeZone: ZONE,
      now: NOW,
    });
    // "event:a" sorts before "task:b".
    expect(rows.map((row) => row.id)).toEqual(['event:a', 'task:b']);
  });
});

describe('rowTone and rowSymbol', () => {
  const day = Date.parse(atLocal('2026-09-16', '12:00'));
  const rowFor = (overrides: Partial<NexdoTask>) =>
    calendarRows({ tasks: [task({ id: 't', startAt: atLocal('2026-09-16', '09:00'), ...overrides })], events: [], day, timeZone: ZONE, now: NOW })[0];

  it('prefers critical over late', () => {
    expect(rowTone(rowFor({ critical: true, dueAt: atLocal('2026-09-01') }), ZONE, NOW)).toBe('critical');
  });

  it('marks an overdue task late', () => {
    expect(rowTone(rowFor({ dueAt: atLocal('2026-09-01') }), ZONE, NOW)).toBe('late');
  });

  it('is normal otherwise', () => {
    expect(rowTone(rowFor({}), ZONE, NOW)).toBe('normal');
  });

  it('gives an event the calendar glyph and an overdue task the document glyph', () => {
    const eventRow = calendarRows({ tasks: [], events: [event({ id: 'e' })], day, timeZone: ZONE, now: NOW })[0];
    expect(rowSymbol(eventRow, ZONE, NOW)).toBe('calendar');
    expect(rowSymbol(rowFor({ dueAt: atLocal('2026-09-01') }), ZONE, NOW)).toBe('doc.text');
    expect(rowSymbol(rowFor({}), ZONE, NOW)).toBe('checkmark.square');
  });
});
