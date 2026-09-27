import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { CALL_WINDOW, LATE_DIAL_GRACE_MINUTES } from './config';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isLocalTime = (value: unknown): value is string => typeof value === 'string' && HHMM.test(value);
export const isLocalDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}

export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const localDateIn = (timeZone: string, now = new Date()) => formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
export const localTimeIn = (timeZone: string, now = new Date()) => formatInTimeZone(now, timeZone, 'HH:mm');

/** The saved time clamped into the allowed calling window. */
export function effectiveCallTime(localTime: string): string {
  const minutes = Math.min(Math.max(minutesOf(localTime), minutesOf(CALL_WINDOW.earliest)), minutesOf(CALL_WINDOW.latest));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Whether today's first call is due now: at or after the saved time, not more than the grace
 * period late, and never after the latest calling time. Returns the scheduled instant when due.
 */
export function dueCall(localTime: string, timeZone: string, now = new Date()): { localDate: string; scheduledFor: Date } | null {
  const localDate = localDateIn(timeZone, now);
  const target = effectiveCallTime(localTime);
  const scheduledFor = fromZonedTime(`${localDate}T${target}:00`, timeZone);
  const lateMs = now.getTime() - scheduledFor.getTime();
  if (lateMs < 0 || lateMs > LATE_DIAL_GRACE_MINUTES * 60_000) return null;
  if (minutesOf(localTimeIn(timeZone, now)) > minutesOf(CALL_WINDOW.latest)) return null;
  return { localDate, scheduledFor };
}

/** Whether a retry or call-back at this instant still falls inside the calling window. */
export function withinCallWindow(timeZone: string, at: Date): boolean {
  const minutes = minutesOf(localTimeIn(timeZone, at));
  return minutes >= minutesOf(CALL_WINDOW.earliest) && minutes <= minutesOf(CALL_WINDOW.latest);
}

/** Inclusive list of local dates ending at `endDate`. */
export function dateRange(endDate: string, days: number): string[] {
  const end = Date.parse(`${endDate}T12:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}
