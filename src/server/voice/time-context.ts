import { formatInTimeZone } from 'date-fns-tz';

export function voiceClock(timeZone: string, now = new Date()) {
  return {
    timeZone,
    currentInstant: now.toISOString(),
    localDateTime: formatInTimeZone(now, timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    localClock: formatInTimeZone(now, timeZone, 'EEEE, MMMM d, yyyy h:mm:ss a zzz'),
  };
}

export function voiceTimeInstructions(timeZone: string, now: Date) {
  const clock = voiceClock(timeZone, now);
  return `User timezone ${clock.timeZone}. Current LOCAL date and time: ${clock.localDateTime} (${clock.localClock}). UTC instant for comparison only: ${clock.currentInstant}. The UTC hour is NOT the user's local hour. Call get_current_time before resolving relative dates or claiming a requested time has passed. Preserve an explicit AM or PM: 6 AM is 06:00, never 18:00. Use this IANA timezone's offset on the requested date, including daylight saving; colloquial PST/Pacific means America/Los_Angeles when that is the user's zone, not a fixed -08:00 year-round. Working hours are separate from timezone and whether an instant is in the past. An outside-working-hours warning must not change AM to PM, roll the date forward, or imply that the time has passed. Explain the warning and ask whether to keep the exact requested time. A failed correction leaves the original saved time unchanged; state that clearly.`;
}
