import type { NexdoTask } from '../api/types';
import {
  DEFAULT_TASK_QUERY,
  DISTANT_FUTURE,
  addDays,
  dayKey,
  historyInterval,
  revealCreatedTask,
  snapshot,
  standardContains,
  startOfDay,
  type TaskQuery,
} from './taskQuery';

/**
 * Port of the behaviour in `ios/Sources/NexdoCore/TaskQuery.swift`.
 *
 * The account zone is Asia/Kolkata throughout (UTC+05:30, no DST) because that is the account the app
 * is being tested on, and its half-hour offset catches day-boundary arithmetic that a whole-hour zone
 * would hide. DST is covered separately against America/New_York.
 */

const ZONE = 'Asia/Kolkata';

/** 2026-09-16 09:00 in Asia/Kolkata. */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return {
    title: 'A task',
    status: 'PLANNED',
    priority: 'MEDIUM',
    durationMin: 30,
    ...overrides,
  };
}

/** `startAt` at a given local wall time in the account zone, as the server would send it. */
function atLocal(ymd: string, hm = '10:00'): string {
  const [hour, minute] = hm.split(':').map(Number);
  return new Date(Date.parse(`${ymd}T00:00:00.000Z`) - 5.5 * 3_600_000 + (hour * 60 + minute) * 60_000).toISOString();
}

function query(overrides: Partial<TaskQuery> = {}): TaskQuery {
  return { ...DEFAULT_TASK_QUERY, ...overrides };
}

describe('zone arithmetic', () => {
  it('reads the account day, not the device day', () => {
    // 23:00 UTC on the 15th is already 04:30 on the 16th in Kolkata.
    expect(dayKey(Date.parse('2026-09-15T23:00:00.000Z'), ZONE)).toBe('2026-09-16');
  });

  it('startOfDay lands on the local midnight', () => {
    expect(new Date(startOfDay(NOW, ZONE)).toISOString()).toBe('2026-09-15T18:30:00.000Z');
  });

  it('addDays crosses a month boundary', () => {
    expect(dayKey(addDays(Date.parse('2026-09-30T12:00:00.000Z'), 1, ZONE), ZONE)).toBe('2026-10-01');
    expect(dayKey(addDays(Date.parse('2026-01-01T12:00:00.000Z'), -1, ZONE), ZONE)).toBe('2025-12-31');
  });

  it('survives a spring-forward day, where local midnight still exists', () => {
    // US DST begins 2026-03-08; the skipped hour is 02:00, not midnight.
    const during = Date.parse('2026-03-08T18:00:00.000Z');
    expect(dayKey(startOfDay(during, 'America/New_York'), 'America/New_York')).toBe('2026-03-08');
    expect(dayKey(addDays(during, 1, 'America/New_York'), 'America/New_York')).toBe('2026-03-09');
  });

  it('survives a fall-back day, where local midnight happens once', () => {
    const during = Date.parse('2026-11-01T18:00:00.000Z');
    expect(dayKey(startOfDay(during, 'America/New_York'), 'America/New_York')).toBe('2026-11-01');
    expect(dayKey(addDays(during, 1, 'America/New_York'), 'America/New_York')).toBe('2026-11-02');
  });
});

describe('standardContains', () => {
  it.each([
    ['Réservation', 'reservation'],
    ['RESERVATION', 'réserv'],
    ['Call Ana', 'ana'],
  ])('%s matches %s, as localizedStandardContains does', (haystack, needle) => {
    expect(standardContains(haystack, needle)).toBe(true);
  });

  it('does not match an absent term', () => {
    expect(standardContains('Call Ana', 'zoe')).toBe(false);
  });
});

describe('filtering', () => {
  it('drops CANCELLED tasks whatever the status filter', () => {
    const tasks = [task({ id: 'a', status: 'CANCELLED', startAt: atLocal('2026-09-16') })];
    for (const status of ['Open', 'Completed', 'All'] as const) {
      expect(snapshot(query({ status }), tasks, ZONE, NOW).tasks).toHaveLength(0);
    }
  });

  it('Open hides completed work and Completed hides open work', () => {
    const tasks = [
      task({ id: 'open', startAt: atLocal('2026-09-16') }),
      task({ id: 'done', status: 'COMPLETED', startAt: atLocal('2026-09-16') }),
    ];
    expect(snapshot(query({ status: 'Open' }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['open']);
    expect(snapshot(query({ status: 'Completed' }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['done']);
    expect(snapshot(query({ status: 'All' }), tasks, ZONE, NOW).tasks).toHaveLength(2);
  });

  it('filters by priority', () => {
    const tasks = [
      task({ id: 'high', priority: 'HIGH', startAt: atLocal('2026-09-16') }),
      task({ id: 'low', priority: 'LOW', startAt: atLocal('2026-09-16') }),
    ];
    expect(snapshot(query({ priority: 'HIGH' }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['high']);
  });

  it('searches the title and the notes, and ignores surrounding space', () => {
    const tasks = [
      task({ id: 'title', title: 'Renew passport', startAt: atLocal('2026-09-16') }),
      task({ id: 'notes', title: 'Errand', notes: 'collect the passport photos', startAt: atLocal('2026-09-16') }),
      task({ id: 'neither', title: 'Standup', startAt: atLocal('2026-09-16') }),
    ];
    const found = snapshot(query({ search: '  passport  ' }), tasks, ZONE, NOW).tasks.map((item) => item.id);
    expect(found).toEqual(['notes', 'title']);
  });
});

describe('date filters and pill counts', () => {
  const tasks = [
    task({ id: 'today', startAt: atLocal('2026-09-16', '09:00') }),
    task({ id: 'tomorrow', startAt: atLocal('2026-09-17', '09:00') }),
    task({ id: 'sunday', startAt: atLocal('2026-09-20', '09:00') }),
    task({ id: 'lastweek', startAt: atLocal('2026-09-07', '09:00') }),
    task({ id: 'unscheduled' }),
  ];

  it('selects the day for Today and Tomorrow', () => {
    expect(snapshot(query({ date: 'Today' }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['today']);
    expect(snapshot(query({ date: 'Tomorrow' }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['tomorrow']);
  });

  it('runs This Week Monday to Sunday, matching firstWeekday = 2', () => {
    // 2026-09-16 is a Wednesday, so the week is Mon 14th to Sun 20th: the 7th falls outside it.
    const ids = snapshot(query({ date: 'This Week' }), tasks, ZONE, NOW).tasks.map((item) => item.id);
    expect(ids).toEqual(['today', 'tomorrow', 'sunday']);
  });

  it('counts every pill from the same filtered pass', () => {
    const counts = snapshot(query({ date: 'Today' }), tasks, ZONE, NOW).counts;
    expect(counts).toEqual({ Today: 1, Tomorrow: 1, 'This Week': 3, All: 4 });
  });

  it('never counts an unscheduled task under a dated pill', () => {
    const counts = snapshot(query(), [task({ id: 'unscheduled' })], ZONE, NOW).counts;
    expect(counts.Today).toBe(0);
    expect(counts.Tomorrow).toBe(0);
    expect(counts['This Week']).toBe(0);
  });

  it('treats an unscheduled open task as upcoming under All, so it sections first', () => {
    // Its sort key is `Date.distantFuture`, which is >= tomorrow, so the `upcomingOpen` clause both
    // rescues it into the list and puts it in the upcoming half of the ordering. Today's task is
    // already in the past by `now`, so it sorts into the history half, after it.
    const result = snapshot(
      query({ date: 'All', historyRange: 'Last 2 weeks' }),
      [task({ id: 'unscheduled' }), task({ id: 'today', startAt: atLocal('2026-09-16', '08:00') })],
      ZONE,
      NOW,
    );
    expect(result.tasks.map((item) => item.id)).toEqual(['unscheduled', 'today']);
    expect(result.sections[0].date).toBe(DISTANT_FUTURE);
  });
});

describe('history ranges under the All pill', () => {
  it('This Month covers the calendar month and excludes upcoming open work beyond it', () => {
    const interval = historyInterval('This Month', NOW, ZONE);
    expect(dayKey(interval.start, ZONE)).toBe('2026-09-01');
    expect(dayKey(interval.end, ZONE)).toBe('2026-10-01');
  });

  it('Last Month is the previous calendar month, ending where this month starts', () => {
    const interval = historyInterval('Last Month', NOW, ZONE);
    expect(dayKey(interval.start, ZONE)).toBe('2026-08-01');
    expect(dayKey(interval.end, ZONE)).toBe('2026-09-01');
  });

  it('Last 2 weeks runs 13 days back through the end of today', () => {
    const interval = historyInterval('Last 2 weeks', NOW, ZONE);
    expect(dayKey(interval.start, ZONE)).toBe('2026-09-03');
    expect(dayKey(interval.end, ZONE)).toBe('2026-09-17');
  });

  it('adds upcoming open tasks outside the range, except under This Month', () => {
    const tasks = [task({ id: 'next-month', startAt: atLocal('2026-10-20') })];
    // This Month: the October task is outside the interval and is not rescued.
    expect(snapshot(query({ date: 'All', historyRange: 'This Month' }), tasks, ZONE, NOW).tasks).toHaveLength(0);
    // Last 2 weeks: the same task is open and still ahead, so it is included.
    expect(snapshot(query({ date: 'All', historyRange: 'Last 2 weeks' }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['next-month']);
  });

  it('does not rescue a COMPLETED task from outside the range', () => {
    const tasks = [task({ id: 'done-later', status: 'COMPLETED', startAt: atLocal('2026-10-20') })];
    expect(snapshot(query({ date: 'All', historyRange: 'Last 2 weeks', status: 'All' }), tasks, ZONE, NOW).tasks).toHaveLength(0);
  });
});

describe('ordering', () => {
  it('puts open work before completed work', () => {
    const tasks = [
      task({ id: 'done', status: 'COMPLETED', startAt: atLocal('2026-09-16', '08:00') }),
      task({ id: 'open', startAt: atLocal('2026-09-16', '17:00') }),
    ];
    expect(snapshot(query({ status: 'All' }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['open', 'done']);
  });

  it('honours earliestFirst within a day', () => {
    const tasks = [
      task({ id: 'late', startAt: atLocal('2026-09-16', '17:00') }),
      task({ id: 'early', startAt: atLocal('2026-09-16', '08:00') }),
    ];
    expect(snapshot(query({ earliestFirst: true }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['early', 'late']);
    expect(snapshot(query({ earliestFirst: false }), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['late', 'early']);
  });

  it('breaks an exact tie by id, so the order is stable', () => {
    const tasks = [
      task({ id: 'b', startAt: atLocal('2026-09-16', '09:00') }),
      task({ id: 'a', startAt: atLocal('2026-09-16', '09:00') }),
    ];
    expect(snapshot(query(), tasks, ZONE, NOW).tasks.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('lists upcoming work before history under All, soonest first then newest first', () => {
    const tasks = [
      task({ id: 'past-old', startAt: atLocal('2026-09-04', '09:00') }),
      task({ id: 'past-recent', startAt: atLocal('2026-09-10', '09:00') }),
      task({ id: 'soon', startAt: atLocal('2026-09-18', '09:00') }),
      task({ id: 'later', startAt: atLocal('2026-09-25', '09:00') }),
    ];
    const ids = snapshot(query({ date: 'All', historyRange: 'Last 2 weeks' }), tasks, ZONE, NOW).tasks.map((item) => item.id);
    // `earliestFirst` is ignored under All: upcoming ascending, then history descending.
    expect(ids).toEqual(['soon', 'later', 'past-recent', 'past-old']);
  });
});

describe('sections', () => {
  it('groups by day, splitting when done-ness changes', () => {
    const tasks = [
      task({ id: 'open-today', startAt: atLocal('2026-09-16', '09:00') }),
      task({ id: 'open-today-2', startAt: atLocal('2026-09-16', '11:00') }),
      task({ id: 'done-today', status: 'COMPLETED', startAt: atLocal('2026-09-16', '10:00') }),
    ];
    const sections = snapshot(query({ status: 'All' }), tasks, ZONE, NOW).sections;
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ isDone: false });
    expect(sections[0].tasks.map((item) => item.id)).toEqual(['open-today', 'open-today-2']);
    expect(sections[1]).toMatchObject({ isDone: true });
    expect(sections[1].tasks.map((item) => item.id)).toEqual(['done-today']);
  });

  it('sections a multi-day list by local day', () => {
    const tasks = [
      task({ id: 'thu', startAt: atLocal('2026-09-17', '09:00') }),
      task({ id: 'fri', startAt: atLocal('2026-09-18', '09:00') }),
    ];
    const sections = snapshot(query({ date: 'All', historyRange: 'Last 2 weeks' }), tasks, ZONE, NOW).sections;
    expect(sections.map((section) => dayKey(section.date, ZONE))).toEqual(['2026-09-17', '2026-09-18']);
  });

  it('gives each section a stable id combining done-ness and the day', () => {
    const tasks = [task({ id: 'a', startAt: atLocal('2026-09-16', '09:00') })];
    const [section] = snapshot(query(), tasks, ZONE, NOW).sections;
    expect(section.id).toBe(`false-${startOfDay(NOW, ZONE)}`);
  });
});

describe('revealCreatedTask', () => {
  it('moves to Today and clears the filters that would hide the new task', () => {
    const next = revealCreatedTask(query({ date: 'All', search: 'x', status: 'Completed', priority: 'HIGH' }), NOW, ZONE, NOW);
    expect(next).toMatchObject({ date: 'Today', search: '', status: 'Open', priority: 'All' });
  });

  it('moves to Tomorrow for a task scheduled tomorrow', () => {
    const tomorrow = Date.parse(atLocal('2026-09-17', '09:00'));
    expect(revealCreatedTask(query(), tomorrow, ZONE, NOW).date).toBe('Tomorrow');
  });

  it('falls back to All for any other day', () => {
    const later = Date.parse(atLocal('2026-09-25', '09:00'));
    expect(revealCreatedTask(query(), later, ZONE, NOW).date).toBe('All');
  });

  it('keeps earliestFirst and historyRange, which Swift does not reset', () => {
    const next = revealCreatedTask(query({ earliestFirst: false, historyRange: 'Last Month' }), NOW, ZONE, NOW);
    expect(next).toMatchObject({ earliestFirst: false, historyRange: 'Last Month' });
  });
});
