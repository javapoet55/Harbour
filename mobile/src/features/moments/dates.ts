import { addDays, dayKey, startOfDay } from '../../lib/taskQuery';

/**
 * `MomentDates` (ios/Sources/NexdoCore/ImportantMoment.swift:44-74), and the zone arithmetic the
 * Moments views do inline with `Calendar(identifier: .gregorian)`.
 *
 * Every function takes the MOMENT's zone (`timeZoneID`), never the account's: a recipient's birthday
 * is a day in their zone. An identifier the device does not know falls back to the device zone, which
 * is `TimeZone(identifier:) ?? .current`.
 */

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function safeZone(zone: string): string {
  return isValidZone(zone) ? zone : deviceZone();
}

/** `MomentDates.day(_:zone:)`: the `yyyy-MM-dd` an instant falls on in `zone`. */
export function momentDay(at: number, zone: string): string {
  return dayKey(at, zone);
}

/**
 * `MomentDates.date(_:zone:)`: midnight of `day` in `zone`. Swift's formatter returns `Date()` for a
 * string it cannot parse, and so does this.
 */
export function momentDate(day: string, zone: string, now: number = Date.now()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return now;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const noon = Date.UTC(year, month - 1, date, 12);
  if (new Date(noon).getUTCDate() !== date) return now;
  return startOfDay(noon, safeZone(zone));
}

/** Whole calendar days from `from` to `to`, both `yyyy-MM-dd`. */
export function daysBetween(from: string, to: string): number {
  const parse = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** `MomentDates.relative(_:zone:now:)`. */
export function momentRelative(value: string, zone: string, now: number = Date.now()): string {
  const days = daysBetween(momentDay(now, zone), momentDay(momentDate(value, zone, now), zone));
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 ? `In ${days} days` : 'Past moment';
}

/**
 * `MomentDates.sendDayLabel(_:zone:)`: `"EEE, MMM d, yyyy"` in `en_US_POSIX`, e.g. "Sun, Oct 25, 2026".
 */
export function sendDayLabel(at: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(zone),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('month')} ${get('day')}, ${get('year')}`;
}

/**
 * A `DateFormatter` with `dateStyle = .medium` in the DEVICE locale, as SwiftUI's compact `DatePicker`
 * and `MomentDates.label` use: "19 Sep 2026" in an English (India/UK) locale, "Sep 19, 2026" in a US
 * one. Built with `.format()`, never assembled from `formatToParts`, because the part ORDER is what
 * differs between locales (UI-parity pass 2; SHARED-REQUESTS "DateField"). `locale` is a test seam.
 */
export function mediumDate(at: number, zone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: safeZone(zone), day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(at));
}

/** `timeStyle = .short` in the device locale: "10:50 PM", or "22:50" where the locale uses 24 hours. */
export function shortTimeIn(at: number, zone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: safeZone(zone), hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

/**
 * `MomentDates.label(_:zone:)`: `dateStyle = .medium, timeStyle = .short` in the device locale, joined
 * the way iOS 26 joins the two styles in English — "19 Sep 2026 at 10:50 PM".
 */
export function momentLabel(at: number, zone: string, locale?: string): string {
  return `${mediumDate(at, zone, locale)} at ${shortTimeIn(at, zone, locale)}`;
}

/** `synced.formatted(date: .omitted, time: .shortened)` in the device zone and locale. */
export function shortTime(at: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

/** `MomentDates.parseInstant(_:)` and `WishDeliveryPlan.date`: ISO-8601 with or without fractions. */
export function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

/** `ISO8601DateFormatter().string(from:)`: whole seconds, `Z`. */
export function isoString(at: number): string {
  return new Date(Math.floor(at / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * `MomentDates.next(_:yearly:zone:now:)`: the next occurrence of a yearly date. **February 29 is
 * observed on February 28 in a non-leap year**, which is also the server's rule
 * (src/server/moments/domain.ts `occurrence`).
 */
export function nextOccurrence(day: string, yearly: boolean, zone: string, now: number = Date.now()): string {
  if (!yearly) return day;
  const today = momentDay(now, zone);
  const suffix = day.slice(-5);
  const year = Number(today.slice(0, 4));
  for (let y = year; y <= year + 8; y++) {
    const candidate = `${y}-${suffix === '02-29' && !isLeap(y) ? '02-28' : suffix}`;
    if (candidate >= today) return candidate;
  }
  return day;
}

/** The wall-clock parts of an instant in `zone`. */
export function wallParts(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(zone),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/**
 * `FestivalValidation.instant(day:hour:minute:zone:)` (FestivalManagement.swift:68-75): the instant
 * `hour:minute` falls on `day` in `zone`, or `null` when that wall time does not exist (a DST gap)
 * or the zone is unknown. A repeated wall time takes the FIRST instant (`repeatedTimePolicy: .first`).
 */
export function zonedInstant(day: string, hour: number, minute: number, zone: string): number | null {
  if (!isValidZone(zone)) return null;
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return null;
  const naive = Date.UTC(y, m - 1, d, hour, minute);
  const candidates = new Set<number>();
  for (const probe of [naive - 43_200_000, naive, naive + 43_200_000]) {
    const wall = wallParts(probe, zone);
    const offset = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - probe;
    candidates.add(naive - offset);
  }
  const matching = [...candidates]
    .filter((at) => {
      const wall = wallParts(at, zone);
      return momentDay(at, zone) === day && wall.hour === hour && wall.minute === minute;
    })
    .sort((a, b) => a - b);
  return matching[0] ?? null;
}

/**
 * The Manage Moment date setter (ManageFestivalModel.swift:9-21): move `sendDate` to the new `day`,
 * keeping its local time of day; unchanged when that time does not exist on the new day.
 */
export function keepTimeOnDay(sendDate: number, day: string, zone: string): number {
  const wall = wallParts(sendDate, zone);
  return zonedInstant(day, wall.hour, wall.minute, zone) ?? sendDate;
}

/** Midnight of the day containing `at` in `zone`. */
export function momentStartOfDay(at: number, zone: string): number {
  return startOfDay(at, safeZone(zone));
}

export { addDays };

/**
 * `upcomingGroup(now:)` (ImportantMoment.swift:101-116). The five buckets, and Swift's ORDER of
 * checks, which is not the display order: "Next Month" is tested before "Next Week", so a
 * next-week occasion that falls in next month shows under Next Month.
 *
 * `Calendar.current` with the moment's zone: the week follows the device locale's first weekday,
 * which on the en-US reference device is Sunday.
 */
export const UPCOMING_GROUPS = ['This Week', 'Next Week', 'This Month', 'Next Month', 'Later'] as const;
export type UpcomingGroup = (typeof UPCOMING_GROUPS)[number];

export function upcomingGroupFor(nextOccurrenceDay: string, zone: string, now: number = Date.now()): UpcomingGroup {
  const timeZone = safeZone(zone);
  const occurrence = momentDate(nextOccurrenceDay, timeZone, now);
  const today = startOfDay(now, timeZone);
  const [y, m, d] = momentDay(today, timeZone).split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const weekStart = addDays(today, -weekday, timeZone);
  const weekEnd = addDays(weekStart, 7, timeZone);
  if (occurrence >= weekStart && occurrence < weekEnd) return 'This Week';
  const monthStart = startOfDay(Date.UTC(y, m - 1, 1, 12), timeZone);
  const nextMonthStart = startOfDay(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 12), timeZone);
  const monthAfter = startOfDay(Date.UTC(m >= 11 ? y + 1 : y, (m + 1) % 12, 1, 12), timeZone);
  if (occurrence >= nextMonthStart && occurrence < monthAfter) return 'Next Month';
  if (occurrence >= weekEnd && occurrence < addDays(weekEnd, 7, timeZone)) return 'Next Week';
  if (occurrence >= monthStart && occurrence < nextMonthStart) return 'This Month';
  return 'Later';
}
