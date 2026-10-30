/**
 * `AppReviewSchedule` (ios/Sources/NexdoCore/AppReviewSchedule.swift, bfa5b73): "Five consecutive Friday
 * opportunities after the first seven calendar days. Missed Fridays expire; never catch up with multiple
 * requests on a later day."
 *
 * A request is eligible on a device-local **Friday at or after 17:00**, at least seven calendar days after
 * first launch, in Friday weeks 0–4 counted from the first Friday on or after that day, once per week.
 *
 * Swift does its date math in a Gregorian `Calendar` set to the device time zone. This does the same with
 * `Intl` wall-clock parts: "+7 days" keeps the wall-clock time across a DST change, as
 * `calendar.date(byAdding: .day, value: 7, to:)` does, and the day count is in calendar days.
 */

export type ReviewSchedule = {
  /** Epoch milliseconds of the first launch. */
  firstLaunch: number;
  lastRequestedWeek?: number;
};

/** The number of Friday opportunities (`week < 5`). */
export const REVIEW_WEEKS = 5;
/** `calendar.component(.hour, from: now) >= 17`. */
export const REVIEW_HOUR = 17;
const FRIDAY = 5; // JS weekday; Swift's `.weekday == 6` (1 = Sunday).
const DAY_MS = 86_400_000;

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    formatters.set(timeZone, value);
  }
  return value;
}

/** The wall-clock parts of an instant in a zone. */
function wall(at: number, timeZone: string): Wall {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(at))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return { year: parts.year, month: parts.month, day: parts.day, hour, minute: parts.minute, second: parts.second, weekday };
}

/** A wall-clock time as if it were UTC: the zone-free number the offset is measured against. */
function asUtc(value: Pick<Wall, 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'>): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
}

/** The instant a wall-clock time names in a zone (two passes, so it settles across an offset change). */
function instant(value: Pick<Wall, 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'>, timeZone: string): number {
  const target = asUtc(value);
  let guess = target;
  for (let pass = 0; pass < 2; pass += 1) guess = target - (asUtc(wall(guess, timeZone)) - guess);
  return guess;
}

/** A calendar date as a day number, so differences are calendar days whatever the DST. */
function dayNumber(value: Pick<Wall, 'year' | 'month' | 'day'>): number {
  return Date.UTC(value.year, value.month - 1, value.day) / DAY_MS;
}

/** `eligibleWeek(at:timeZone:)`: the Friday week (0–4) open at `now`, or `null`. */
export function eligibleWeek(schedule: ReviewSchedule, now: number, timeZone: string): number | null {
  const launch = wall(schedule.firstLaunch, timeZone);
  // `calendar.date(byAdding: .day, value: 7, to: firstLaunch)`: the same wall-clock time a week on.
  const shifted = new Date(Date.UTC(launch.year, launch.month - 1, launch.day + 7));
  const threshold = instant({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), hour: launch.hour, minute: launch.minute, second: launch.second }, timeZone) + (schedule.firstLaunch % 1000);
  const local = wall(now, timeZone);
  if (now < threshold || local.weekday !== FRIDAY || local.hour < REVIEW_HOUR) return null;
  const thresholdDay = wall(threshold, timeZone);
  const daysUntilFriday = (FRIDAY - thresholdDay.weekday + 7) % 7;
  const days = dayNumber(local) - (dayNumber(thresholdDay) + daysUntilFriday);
  if (days < 0) return null;
  const week = Math.floor(days / 7);
  if (!(week < REVIEW_WEEKS) || !(week > (schedule.lastRequestedWeek ?? -1))) return null;
  return week;
}

/**
 * `consumeOpportunity(at:timeZone:)`: the schedule with this week used, or `null` when nothing is open.
 * "Persist this state before invoking StoreKit, which does not report whether it showed a prompt."
 */
export function consumeOpportunity(schedule: ReviewSchedule, now: number, timeZone: string): ReviewSchedule | null {
  const week = eligibleWeek(schedule, now, timeZone);
  return week === null ? null : { ...schedule, lastRequestedWeek: week };
}

/** A stored schedule, or `null` when it is missing or unreadable (Swift's failed decode). */
export function parseReviewSchedule(raw: string | null): ReviewSchedule | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReviewSchedule> | null;
    if (!value || typeof value.firstLaunch !== 'number' || !Number.isFinite(value.firstLaunch)) return null;
    if (value.lastRequestedWeek !== undefined && !Number.isInteger(value.lastRequestedWeek)) return null;
    return value.lastRequestedWeek === undefined ? { firstLaunch: value.firstLaunch } : { firstLaunch: value.firstLaunch, lastRequestedWeek: value.lastRequestedWeek };
  } catch {
    return null;
  }
}
