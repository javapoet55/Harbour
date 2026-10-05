import { formatInTimeZone } from 'date-fns-tz';
import { addDays, parseYmd, zonedDateTime } from '@/lib/time';
import { occurrence } from '@/server/moments/domain';
import { CALL_WINDOW } from '@/server/nutrition/config';
import { isLocalTime, isTimeZone, minutesOf } from '@/server/nutrition/time';

export const DEFAULT_CONNECT_TIME = '09:00';
export const CONNECT_GRACE_MINUTES = 60;

/** Whether a 10-digit number without a country code can safely be read as US/Canada (+1) for this time zone. */
export const nanpZone = (timeZone: string) => timeZone.startsWith('America/') || ['Pacific/Honolulu', 'US/Hawaii', 'US/Alaska'].includes(timeZone);

/**
 * A phone number as E.164. Numbers with a country code ("+91 98765 43210", "0091 …") always work. A bare
 * 10-digit number is read as US/Canada only when `assumeNanp` is true (the person is in a US/Canada time
 * zone); otherwise "98765 43210" could be an Indian mobile, so it is rejected instead of dialing the wrong person.
 */
export function toE164(raw: string, assumeNanp = false): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
    const international = trimmed.startsWith('00') ? digits.slice(2) : digits;
    return /^[1-9]\d{7,14}$/.test(international) ? `+${international}` : null;
  }
  if (!assumeNanp) return null;
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

const localMinutes = (tz: string, at: Date) => minutesOf(formatInTimeZone(at, tz, 'HH:mm'));
export const inWindow = (tz: string, at: Date) => {
  const m = localMinutes(tz, at);
  return m >= minutesOf(CALL_WINDOW.earliest) && m <= minutesOf(CALL_WINDOW.latest);
};

type MomentTiming = { occurrenceDate: string; yearly: boolean; timeZoneID: string; connectTime: string; connectTimeZone: string };
export const connectZone = (m: Pick<MomentTiming, 'connectTimeZone' | 'timeZoneID'>) => m.connectTimeZone || m.timeZoneID;

/** True when `zonedDateTime` failed because that local time does not exist on that date (a daylight-saving gap). */
const invalidLocalTime = (e: unknown) => e instanceof Error && e.message === 'INVALID_LOCAL_TIME';

/**
 * The next connect call for a moment: the moment day (in the chosen time zone) at the chosen time.
 * A connectTime that falls into a daylight-saving gap cannot happen that day, so a yearly moment
 * moves to the next year that can host it; a one-off moment has no other day and returns null.
 */
export function nextConnectAt(m: MomentTiming, now = new Date()): { date: string; at: Date } | null {
  const zone = connectZone(m);
  let cursor = now;
  for (let i = 0; i < 4; i++) {
    const date = occurrence(m.occurrenceDate, m.yearly, zone, cursor);
    try {
      return { date, at: zonedDateTime(date, m.connectTime, zone) };
    } catch (e) {
      if (!invalidLocalTime(e) || !m.yearly) return null;
      // Past this zone-day (a day and a margin, whichever way the offset leans): the next yearly candidate.
      cursor = addDays(parseYmd(date), 2);
    }
  }
  return null;
}

/** Whether today's connect call is due now: on the moment day, at or after the time, at most an hour late. */
export function dueConnect(m: MomentTiming, now = new Date()): { date: string; at: Date } | null {
  const zone = connectZone(m);
  const today = formatInTimeZone(now, zone, 'yyyy-MM-dd');
  const date = occurrence(m.occurrenceDate, m.yearly, zone, now);
  if (date !== today) return null;
  let at: Date;
  try {
    at = zonedDateTime(date, m.connectTime, zone);
  } catch (e) {
    if (invalidLocalTime(e)) return null; // that local time never happens today: the call is skipped
    throw e;
  }
  if (!inWindow(zone, at)) return null; // legacy rows can hold a time outside the recipient's window
  const late = now.getTime() - at.getTime();
  return late >= 0 && late <= CONNECT_GRACE_MINUTES * 60_000 ? { date, at } : null;
}

export type ConnectPreview = { userLocal: string; recipientLocal: string; userOk: boolean; recipientOk: boolean };

/** What the chosen time means for the user and the recipient, and whether it is inside each calling window. */
export function previewConnect(at: Date, userZone: string, recipientZone: string): ConnectPreview {
  const fmt = (tz: string) => formatInTimeZone(at, tz, "EEE d MMM, h:mm a");
  return { userLocal: fmt(userZone), recipientLocal: fmt(recipientZone), userOk: inWindow(userZone, at), recipientOk: inWindow(recipientZone, at) };
}

/**
 * The default time: 9:00 AM for the recipient, or, if that falls outside the user's own calling hours,
 * the nearest half hour inside both people's hours (ties go to the recipient's morning).
 */
export function suggestConnectTime(m: Omit<MomentTiming, 'connectTime'>, userZone: string, now = new Date()): string {
  const base = { ...m, connectTime: DEFAULT_CONNECT_TIME };
  const zone = connectZone(base);
  const date = occurrence(m.occurrenceDate, m.yearly, zone, now);
  const ok = (hm: string) => { try { const at = zonedDateTime(date, hm, zone); return inWindow(userZone, at) && inWindow(zone, at); } catch { return false; } };
  if (ok(DEFAULT_CONNECT_TIME)) return DEFAULT_CONNECT_TIME;
  const candidates = Array.from({ length: 28 }, (_, i) => 8 * 60 + i * 30)
    .map(min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)
    .sort((a, b) => Math.abs(minutesOf(a) - 540) - Math.abs(minutesOf(b) - 540));
  return candidates.find(ok) ?? DEFAULT_CONNECT_TIME;
}

export const validConnectTime = isLocalTime;
export const validZone = isTimeZone;
