export type DayAnchor = Date;

function partsInZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function addDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

export function tzToday(timeZone: string, now = new Date()): Date {
  const p = partsInZone(now, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** Convert a local calendar date + HH:mm in `timeZone` to a UTC Date. */
export function zonedDateTime(ymdValue: string, hm: string, timeZone: string): Date {
  const [year, month, day] = ymdValue.split('-').map(Number);
  const [hour, minute] = hm.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 4; i++) {
    const p = partsInZone(guess, timeZone);
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    const observed = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = target - observed;
    if (diff === 0) break;
    guess.setTime(guess.getTime() + diff);
  }
  const resolved = partsInZone(guess, timeZone);
  if (resolved.year !== year || resolved.month !== month || resolved.day !== day || resolved.hour !== hour || resolved.minute !== minute) throw new Error('INVALID_LOCAL_TIME');
  return guess;
}

export function startOfLocalDay(ymdValue: string, timeZone: string): Date {
  return zonedDateTime(ymdValue, '00:00', timeZone);
}

export function endOfLocalDay(ymdValue: string, timeZone: string): Date {
  const next = addDays(parseYmd(ymdValue), 1);
  return new Date(startOfLocalDay(ymd(next), timeZone).getTime() - 1);
}

export function rangeForNextNDays(n: number, timeZone: string, now = new Date()) {
  const start = tzToday(timeZone, now);
  const end = addDays(start, n - 1);
  return {
    from: ymd(start),
    to: ymd(end),
    start: startOfLocalDay(ymd(start), timeZone),
    end: endOfLocalDay(ymd(end), timeZone),
    days: Array.from({ length: n }, (_, i) => ymd(addDays(start, i))),
  };
}

export function formatTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function weekdayName(ymdValue: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(parseYmd(ymdValue));
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
