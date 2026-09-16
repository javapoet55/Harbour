import type { Agenda, CalendarEvent, NexdoTask, ScheduleIntelligenceResponse } from '../api/types';
import {
  buildSchedule,
  dateLabel,
  eventOccursOn,
  greeting,
  rangeTitle,
  scheduleCounts,
  scheduleOrder,
  taskDetail,
  type TodayScheduleItem,
} from './todaySchedule';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata (a Wednesday). */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return { title: 'An event', startAt: '2026-09-16T04:00:00.000Z', endAt: '2026-09-16T05:00:00.000Z', ...overrides };
}

/** Local wall time in the account zone. */
function atLocal(ymd: string, hm = '10:00'): string {
  const [hour, minute] = hm.split(':').map(Number);
  return new Date(Date.parse(`${ymd}T00:00:00.000Z`) - 5.5 * 3_600_000 + (hour * 60 + minute) * 60_000).toISOString();
}

function agenda(overrides: Partial<Agenda> = {}): Agenda {
  return {
    timeZone: ZONE,
    range: { days: ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'] },
    tasks: [],
    events: [],
    overdue: [],
    ...overrides,
  };
}

function item(overrides: Partial<TodayScheduleItem> & { id: string }): TodayScheduleItem {
  return {
    sourceId: overrides.id,
    title: 'Item',
    dateValue: '2026-09-16T04:00:00.000Z',
    timeLabel: '9:30 AM',
    detail: 'Planned task',
    task: null,
    isPast: false,
    ...overrides,
  };
}

describe('rangeTitle', () => {
  it('names each range as Swift does', () => {
    expect(rangeTitle(1)).toBe('Today');
    expect(rangeTitle(3)).toBe('3 days');
    expect(rangeTitle(5)).toBe('5 days');
  });
});

/** `taskDetail(_:deadlineOnly:)` (RootView.swift:930-933). */
describe('taskDetail', () => {
  it('calls out a critical task by priority OR by the flag', () => {
    expect(taskDetail(task({ id: 'a', priority: 'CRITICAL' }), false)).toBe('Critical task');
    expect(taskDetail(task({ id: 'a', critical: true }), false)).toBe('Critical task');
  });

  it('distinguishes a deadline from a planned task', () => {
    expect(taskDetail(task({ id: 'a' }), true)).toBe('Task deadline');
    expect(taskDetail(task({ id: 'a' }), false)).toBe('Planned task');
  });
});

/** `scheduleOrder` (RootView.swift:935-940). */
describe('scheduleOrder', () => {
  it('puts critical items first, whatever their time', () => {
    const critical = item({ id: 'c', dateValue: atLocal('2026-09-16', '17:00'), task: task({ id: 'c', critical: true }) });
    const early = item({ id: 'e', dateValue: atLocal('2026-09-16', '08:00') });
    expect([early, critical].sort(scheduleOrder).map((each) => each.id)).toEqual(['c', 'e']);
  });

  it('orders the rest by date', () => {
    const late = item({ id: 'late', dateValue: atLocal('2026-09-16', '17:00') });
    const early = item({ id: 'early', dateValue: atLocal('2026-09-16', '08:00') });
    expect([late, early].sort(scheduleOrder).map((each) => each.id)).toEqual(['early', 'late']);
  });

  it('sorts an unparseable date last', () => {
    const broken = item({ id: 'broken', dateValue: 'not a date' });
    const good = item({ id: 'good', dateValue: atLocal('2026-09-16', '17:00') });
    expect([broken, good].sort(scheduleOrder).map((each) => each.id)).toEqual(['good', 'broken']);
  });
});

/** `ServerDate.occurs` (Models.swift:221-228). */
describe('eventOccursOn', () => {
  it('covers every day the event spans', () => {
    const multi = event({ id: 'm', startAt: atLocal('2026-09-16', '20:00'), endAt: atLocal('2026-09-18', '02:00') });
    expect(eventOccursOn(multi, '2026-09-16', ZONE)).toBe(true);
    expect(eventOccursOn(multi, '2026-09-17', ZONE)).toBe(true);
    expect(eventOccursOn(multi, '2026-09-18', ZONE)).toBe(true);
    expect(eventOccursOn(multi, '2026-09-19', ZONE)).toBe(false);
  });

  it('does not let an event ending at midnight occupy the next day', () => {
    const upTo = event({ id: 'e', startAt: atLocal('2026-09-16', '22:00'), endAt: atLocal('2026-09-17', '00:00') });
    expect(eventOccursOn(upTo, '2026-09-16', ZONE)).toBe(true);
    expect(eventOccursOn(upTo, '2026-09-17', ZONE)).toBe(false);
  });

  it('rejects an event that ends before it starts', () => {
    const broken = event({ id: 'b', startAt: atLocal('2026-09-16', '10:00'), endAt: atLocal('2026-09-16', '09:00') });
    expect(eventOccursOn(broken, '2026-09-16', ZONE)).toBe(false);
  });
});

describe('buildSchedule', () => {
  it('is empty without an agenda', () => {
    expect(buildSchedule({ agenda: null, tasks: [], intelligence: null, range: 1, now: NOW })).toEqual([]);
  });

  it('builds from the agenda when there is no intelligence', () => {
    const result = buildSchedule({
      agenda: agenda({
        events: [event({ id: 'e1', title: 'Standup' })],
        tasks: [task({ id: 't1', title: 'Pack boxes', startAt: atLocal('2026-09-16', '11:00') })],
      }),
      tasks: [],
      intelligence: null,
      range: 1,
      now: NOW,
    });

    expect(result.map((each) => each.title)).toEqual(['Standup', 'Pack boxes']);
    expect(result[0]).toMatchObject({ detail: 'Calendar appointment', task: null });
    expect(result[1]).toMatchObject({ detail: 'Planned task' });
  });

  it('limits the agenda build to the selected number of days', () => {
    const built = (range: 1 | 3 | 5) =>
      buildSchedule({
        agenda: agenda({
          tasks: [
            task({ id: 'today', startAt: atLocal('2026-09-16', '09:00') }),
            task({ id: 'plus2', startAt: atLocal('2026-09-18', '09:00') }),
            task({ id: 'plus4', startAt: atLocal('2026-09-20', '09:00') }),
          ],
        }),
        tasks: [],
        intelligence: null,
        range,
        now: NOW,
      }).map((each) => each.sourceId);

    expect(built(1)).toEqual(['today']);
    expect(built(3)).toEqual(['today', 'plus2']);
    expect(built(5)).toEqual(['today', 'plus2', 'plus4']);
  });

  it('marks a deadline-only task as due', () => {
    const [row] = buildSchedule({
      agenda: agenda({ tasks: [task({ id: 't1', dueAt: atLocal('2026-09-16', '17:00') })] }),
      tasks: [],
      intelligence: null,
      range: 1,
      now: NOW,
    });
    expect(row.timeLabel).toBe('Due 5:00 PM');
    expect(row.detail).toBe('Task deadline');
  });

  it('excludes completed and cancelled tasks', () => {
    const result = buildSchedule({
      agenda: agenda({
        tasks: [
          task({ id: 'done', status: 'COMPLETED', startAt: atLocal('2026-09-16', '09:00') }),
          task({ id: 'cancelled', status: 'CANCELLED', startAt: atLocal('2026-09-16', '10:00') }),
          task({ id: 'open', startAt: atLocal('2026-09-16', '11:00') }),
        ],
      }),
      tasks: [],
      intelligence: null,
      range: 1,
      now: NOW,
    });
    expect(result.map((each) => each.sourceId)).toEqual(['open']);
  });

  it("uses the server timeline for Today when intelligence is loaded", () => {
    const intelligence = {
      today: {
        day: '2026-09-16',
        timeZone: ZONE,
        commitments: 2,
        appointments: 1,
        tasks: 1,
        overdue: 0,
        availableMinutes: 120,
        timeline: [
          { id: 'tl1', sourceId: 't1', kind: 'task', title: 'Pack boxes', startAt: atLocal('2026-09-16', '11:00'), endAt: null, allDay: false, deadlineOnly: false, past: false },
          { id: 'tl2', sourceId: 'e1', kind: 'event', title: 'Standup', startAt: atLocal('2026-09-16', '09:30'), endAt: null, allDay: false, deadlineOnly: false, past: true },
        ],
        attention: [],
        recommendation: { title: '', explanation: '', additionalAdvice: null, kind: '', taskId: null },
      },
    } as unknown as ScheduleIntelligenceResponse;

    const result = buildSchedule({
      agenda: agenda({ tasks: [task({ id: 'ignored', startAt: atLocal('2026-09-16', '08:00') })] }),
      tasks: [task({ id: 't1', title: 'Pack boxes' })],
      intelligence,
      range: 1,
      now: NOW,
    });

    // The timeline replaces the agenda build wholesale, and keeps the server's order.
    expect(result.map((each) => each.id)).toEqual(['tl1', 'tl2']);
    expect(result[0]).toMatchObject({ detail: 'Planned task' });
    expect(result[1]).toMatchObject({ detail: 'Calendar appointment', isPast: true });
  });

  it('ignores the timeline for a multi-day range', () => {
    const intelligence = { today: { timeline: [{ id: 'tl1' }] } } as unknown as ScheduleIntelligenceResponse;
    const result = buildSchedule({
      agenda: agenda({ tasks: [task({ id: 't1', startAt: atLocal('2026-09-16', '09:00') })] }),
      tasks: [],
      intelligence,
      range: 3,
      now: NOW,
    });
    expect(result.map((each) => each.sourceId)).toEqual(['t1']);
  });
});

describe('scheduleCounts', () => {
  it('splits appointments from tasks', () => {
    const rows = [item({ id: 'a' }), item({ id: 'b', task: task({ id: 'b' }) }), item({ id: 'c', task: task({ id: 'c' }) })];
    expect(scheduleCounts(rows)).toEqual({ appointments: 1, tasks: 2 });
  });

  it('is zero for an empty schedule', () => {
    expect(scheduleCounts([])).toEqual({ appointments: 0, tasks: 0 });
  });
});

describe('greeting', () => {
  it.each([
    ['2026-09-16T00:30:00.000Z', 'Good morning'], // 06:00 Kolkata
    ['2026-09-16T03:30:00.000Z', 'Good morning'], // 09:00
    ['2026-09-16T08:30:00.000Z', 'Good afternoon'], // 14:00
    ['2026-09-16T14:30:00.000Z', 'Good evening'], // 20:00
  ])('at %s says %s', (iso, expected) => {
    expect(greeting(ZONE, Date.parse(iso))).toBe(expected);
  });

  it('reads the ACCOUNT zone, not the device zone', () => {
    // 20:00 UTC is already 01:30 the next day in Kolkata, so it is morning there.
    expect(greeting(ZONE, Date.parse('2026-09-16T20:00:00.000Z'))).toBe('Good morning');
  });

  it('uses noon and 17:00 as the boundaries', () => {
    expect(greeting(ZONE, Date.parse('2026-09-16T06:29:00.000Z'))).toBe('Good morning'); // 11:59
    expect(greeting(ZONE, Date.parse('2026-09-16T06:30:00.000Z'))).toBe('Good afternoon'); // 12:00
    expect(greeting(ZONE, Date.parse('2026-09-16T11:29:00.000Z'))).toBe('Good afternoon'); // 16:59
    expect(greeting(ZONE, Date.parse('2026-09-16T11:30:00.000Z'))).toBe('Good evening'); // 17:00
  });
});

describe('dateLabel', () => {
  it('formats EEE, MMM d, yyyy in the account zone', () => {
    expect(dateLabel(ZONE, NOW)).toBe('Wed, Sep 16, 2026');
  });
});
