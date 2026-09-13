import { z } from 'zod';
import { addDays, parseYmd, tzToday, ymd, zonedDateTime } from '@/lib/time';
export const eventRepeatSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'weekdays']),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
}).strict();
export function eventOccurrences(start: Date, end: Date, zone: string, repeat: z.infer<typeof eventRepeatSchema>) {
  const first = tzToday(zone, start), last = parseYmd(repeat.until);
  const span = Math.round((+last - +first) / 86400000);
  if (ymd(last) !== repeat.until || span < 0 || span > 366) throw new Error('Repeat until must be within one year of the start.');
  if (repeat.frequency === 'weekdays' && !repeat.weekdays.length) throw new Error('Choose at least one weekday.');
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start);
  const duration = +end - +start;
  const result: { startAt: Date; endAt: Date }[] = [];
  for (let offset = 0; offset <= span; offset++) {
    const day = addDays(first, offset);
    const matches = repeat.frequency === 'daily' || (repeat.frequency === 'weekly' && day.getUTCDay() === first.getUTCDay()) || (repeat.frequency === 'monthly' && day.getUTCDate() === first.getUTCDate()) || (repeat.frequency === 'weekdays' && repeat.weekdays.includes(day.getUTCDay()));
    if (!matches) continue;
    // A missing local clock time (spring DST change) is skipped, never shifted.
    let startAt: Date;
    try { startAt = offset === 0 ? start : zonedDateTime(ymd(day), hm, zone); }
    catch { continue; }
    result.push({ startAt, endAt: new Date(+startAt + duration) });
  }
  if (!result.length) throw new Error('No occurrences fall within the selected dates.');
  return result;
}
