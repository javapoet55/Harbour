import { nextOccurrence, parseWeekdays } from './recurrence';
import { ymd, tzToday, zonedDateTime, parseYmd } from './time';
export function nextTaskStart(task: { startAt: Date | null; timeZone: string; recurrence: { frequency: string; interval: number; anchorDay?: number | null; byWeekday?: string | null; until?: Date | null; count?: number | null } | null }, now = new Date()) {
  if (!task.startAt || !task.recurrence || task.recurrence.count && task.recurrence.count <= 1) return null;
  const rule = task.recurrence;
  const recurrence = { frequency: rule.frequency.toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'yearly', interval: rule.interval, byWeekday: parseWeekdays(rule.byWeekday), anchorDay: rule.anchorDay ?? tzToday(task.timeZone, task.startAt).getUTCDate() };
  const today = ymd(tzToday(task.timeZone, now));
  let day = nextOccurrence(ymd(tzToday(task.timeZone, task.startAt)), recurrence);
  // Keep the recurrence cadence, but skip dates missed before completion.
  while (day < today) {
    const following = nextOccurrence(day, recurrence);
    if (following <= day) throw new Error('INVALID_TASK');
    day = following;
  }
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: task.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(task.startAt);
  const start = recurringLocalTime(day, hm, task.timeZone);
  return rule.until && start > rule.until ? null : start;
}

/** A generated occurrence in a clock-change gap moves to the first valid local minute. */
function recurringLocalTime(day: string, hm: string, timeZone: string): Date {
  const [hour, minute] = hm.split(':').map(Number);
  const local = parseYmd(day);
  local.setUTCHours(hour, minute);
  for (let offset = 0; offset <= 1440; offset++) {
    const candidate = new Date(+local + offset * 60000);
    const time = `${String(candidate.getUTCHours()).padStart(2, '0')}:${String(candidate.getUTCMinutes()).padStart(2, '0')}`;
    try { return zonedDateTime(ymd(candidate), time, timeZone); }
    catch (error) { if (!(error instanceof Error) || error.message !== 'INVALID_LOCAL_TIME') throw error; }
  }
  throw new Error('INVALID_LOCAL_TIME');
}
