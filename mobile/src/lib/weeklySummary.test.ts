import {
  addingWeek,
  apiDay,
  dayStringToInstant,
  focusLabel,
  longDay,
  planPrompt,
  startOfWeek,
  taskRangeLabel,
  weekRangeLabel,
  weekdayInitial,
} from './weeklySummary';
import { overdueDeadlineLabel, overdueResults } from './overdueTasks';
import { conditionLabel, conditionSymbol, forecastDayLabel, temperatureLabel, weatherDays } from './weather';
import type { NexdoTask } from '../api/types';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata (a Wednesday). */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

/** `WeeklySummaryDates` (ios/Sources/NexdoCore/WeeklySummary.swift:82-110). */
describe('startOfWeek', () => {
  it('returns the Monday of the week, with firstWeekday = 2', () => {
    // Wednesday the 16th belongs to the week starting Monday the 14th.
    expect(apiDay(startOfWeek(NOW, ZONE), ZONE)).toBe('2026-09-14');
  });

  it('treats Sunday as the END of its week, not the start', () => {
    // 2026-09-20 is a Sunday; its week still begins on Monday the 14th.
    const sunday = Date.parse('2026-09-20T06:00:00.000Z');
    expect(apiDay(startOfWeek(sunday, ZONE), ZONE)).toBe('2026-09-14');
  });

  it('is idempotent on a Monday', () => {
    const monday = startOfWeek(NOW, ZONE);
    expect(apiDay(startOfWeek(monday, ZONE), ZONE)).toBe('2026-09-14');
  });

  it('reads the ACCOUNT zone', () => {
    // 20:00 UTC on Sunday the 13th is already Monday the 14th in Kolkata.
    const late = Date.parse('2026-09-13T20:00:00.000Z');
    expect(apiDay(startOfWeek(late, ZONE), ZONE)).toBe('2026-09-14');
  });
});

describe('addingWeek', () => {
  it('moves a whole week in either direction', () => {
    const monday = startOfWeek(NOW, ZONE);
    expect(apiDay(addingWeek(1, monday, ZONE), ZONE)).toBe('2026-09-21');
    expect(apiDay(addingWeek(-1, monday, ZONE), ZONE)).toBe('2026-09-07');
  });

  it('crosses a month boundary', () => {
    const monday = dayStringToInstant('2026-09-28', ZONE)!;
    expect(apiDay(addingWeek(1, monday, ZONE), ZONE)).toBe('2026-10-05');
  });
});

describe('labels', () => {
  it('weekRangeLabel puts the year only on the end', () => {
    expect(weekRangeLabel(startOfWeek(NOW, ZONE), ZONE)).toBe('Sep 14–Sep 20, 2026');
  });

  it('taskRangeLabel spells both ends with their weekday', () => {
    expect(taskRangeLabel('2026-09-14', '2026-09-20', ZONE)).toBe('Mon, Sep 14 – Sun, Sep 20');
  });

  it('taskRangeLabel falls back to the raw strings when they will not parse', () => {
    expect(taskRangeLabel('nope', 'also-nope', ZONE)).toBe('nope – also-nope');
  });

  it('weekdayInitial gives the narrow letter for the chart axis', () => {
    expect(weekdayInitial('2026-09-14', ZONE)).toBe('M');
    expect(weekdayInitial('2026-09-20', ZONE)).toBe('S');
  });

  it('longDay spells the day out', () => {
    expect(longDay('2026-09-14', ZONE)).toBe('Mon, Sep 14');
  });
});

/** `focusLabel(_:)` (WeeklySummaryView.swift:217). */
describe('focusLabel', () => {
  it.each([
    [null, 'Unavailable'],
    [0, '0m'],
    [45, '45m'],
    [59, '59m'],
    [60, '1.0h'],
    [135, '2.3h'],
  ])('%s reads "%s"', (minutes, expected) => {
    expect(focusLabel(minutes)).toBe(expected);
  });
});

/** `planPrompt(_:)` (WeeklySummaryView.swift:222-227). */
describe('planPrompt', () => {
  const summary = {
    start: '2026-09-14',
    end: '2026-09-20',
    metrics: { completed: 7, planned: 10, overdue: 2, focusMinutes: 150 },
  };

  it('names the NEXT week and quotes this week’s facts', () => {
    const prompt = planPrompt(summary, startOfWeek(NOW, ZONE), ZONE);
    expect(prompt).toContain('from 2026-09-21 through 2026-09-27');
    expect(prompt).toContain('Facts from 2026-09-14 through 2026-09-20');
    expect(prompt).toContain('7 of 10 planned tasks completed, 2 overdue, and 150 recorded focus minutes');
    expect(prompt).toContain('do not modify tasks without my approval');
  });

  it('says so when a metric is unavailable rather than printing null', () => {
    const prompt = planPrompt(
      { ...summary, metrics: { completed: 1, planned: 2, overdue: null, focusMinutes: null } },
      startOfWeek(NOW, ZONE),
      ZONE,
    );
    expect(prompt).toContain('overdue unavailable');
    expect(prompt).toContain('focus time unavailable');
    expect(prompt).not.toContain('null');
  });
});

/** `OverdueTasks.results` (ios/Sources/NexdoCore/OverdueTasks.swift). */
describe('overdueResults', () => {
  const past = '2026-09-15T03:30:00.000Z';
  const future = '2026-09-17T03:30:00.000Z';

  it('keeps only unfinished tasks whose deadline has passed', () => {
    const tasks = [
      task({ id: 'overdue', startAt: past }),
      task({ id: 'future', startAt: future }),
      task({ id: 'done', status: 'COMPLETED', startAt: past }),
      task({ id: 'cancelled', status: 'CANCELLED', startAt: past }),
      task({ id: 'undated' }),
    ];
    expect(overdueResults(tasks, NOW).map((each) => each.id)).toEqual(['overdue']);
  });

  it('prefers startAt over dueAt for the deadline', () => {
    // startAt is in the future, so it is NOT overdue even though dueAt has passed.
    const tasks = [task({ id: 'a', startAt: future, dueAt: past })];
    expect(overdueResults(tasks, NOW)).toHaveLength(0);
  });

  it('falls back to dueAt when there is no startAt', () => {
    expect(overdueResults([task({ id: 'a', dueAt: past })], NOW).map((each) => each.id)).toEqual(['a']);
  });

  it('sorts oldest first, breaking ties by id', () => {
    const tasks = [
      task({ id: 'z', startAt: past }),
      task({ id: 'a', startAt: past }),
      task({ id: 'older', startAt: '2026-09-10T03:30:00.000Z' }),
    ];
    expect(overdueResults(tasks, NOW).map((each) => each.id)).toEqual(['older', 'a', 'z']);
  });

  it('excludes a task due exactly now', () => {
    expect(overdueResults([task({ id: 'a', startAt: new Date(NOW).toISOString() })], NOW)).toHaveLength(0);
  });
});

describe('overdueDeadlineLabel', () => {
  it('formats a medium date with a short time in the account zone', () => {
    // Hermes/ICU joins with a comma where Swift's DateFormatter uses "at"; the parts match.
    expect(overdueDeadlineLabel(NOW, ZONE)).toBe('Sep 16, 2026, 9:00 AM');
  });
});

/** `WeatherResponse` helpers (ios/Sources/NexdoCore/Models.swift:81-140). */
describe('weather helpers', () => {
  it('maps each WMO band to its symbol', () => {
    expect(conditionSymbol(0)).toBe('sun.max.fill');
    expect(conditionSymbol(2)).toBe('cloud.sun.fill');
    expect(conditionSymbol(48)).toBe('cloud.fog.fill');
    expect(conditionSymbol(55)).toBe('cloud.drizzle.fill');
    expect(conditionSymbol(81)).toBe('cloud.rain.fill');
    expect(conditionSymbol(86)).toBe('cloud.snow.fill');
    expect(conditionSymbol(99)).toBe('cloud.bolt.rain.fill');
    expect(conditionSymbol(null)).toBe('thermometer.medium');
  });

  it('names each condition', () => {
    expect(conditionLabel(0)).toBe('Clear');
    expect(conditionLabel(3)).toBe('Cloudy');
    expect(conditionLabel(null)).toBe('Conditions unavailable');
  });

  it('takes the first five days and reads each index defensively', () => {
    const days = weatherDays({
      time: ['a', 'b', 'c', 'd', 'e', 'f'],
      weather_code: [0, 1],
      temperature_2m_max: [80],
      temperature_2m_min: [],
      precipitation_probability_max: [10, 20, 30, 40, 50],
    });
    expect(days).toHaveLength(5);
    expect(days[0]).toEqual({ id: 'a', code: 0, high: 80, low: null, rain: 10 });
    expect(days[4]).toEqual({ id: 'e', code: null, high: null, low: null, rain: 50 });
  });

  it('is empty without a daily block', () => {
    expect(weatherDays(null)).toEqual([]);
  });

  it('rounds a temperature, or shows an em dash', () => {
    expect(temperatureLabel(71.4)).toBe('71°');
    expect(temperatureLabel(null)).toBe('—');
  });

  it('labels the current day "Today" and others by weekday', () => {
    expect(forecastDayLabel('2026-09-16', ZONE, NOW)).toBe('Today');
    expect(forecastDayLabel('2026-09-18', ZONE, NOW)).toBe('Fri, Sep 18');
  });
});
