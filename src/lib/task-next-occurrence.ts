import { nextOccurrence } from './recurrence';
import { ymd, tzToday, zonedDateTime } from './time';
export function nextTaskStart(task: { startAt: Date | null; timeZone: string; recurrence: { frequency: string; interval: number; byWeekday?: string | null; until?: Date | null; count?: number | null } | null }) {
  if (!task.startAt || !task.recurrence || task.recurrence.count && task.recurrence.count <= 1) return null;
  const rule = task.recurrence;
  const day = nextOccurrence(ymd(tzToday(task.timeZone, task.startAt)), { frequency: rule.frequency.toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'yearly', interval: rule.interval, byWeekday: rule.byWeekday?.split(',').map(Number) });
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: task.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(task.startAt);
  const start = zonedDateTime(day, hm, task.timeZone);
  return rule.until && start > rule.until ? null : start;
}
