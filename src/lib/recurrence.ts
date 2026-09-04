import { addDays, parseYmd, ymd } from './time';

export type Recurrence = { frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number; byWeekday?: number[] };

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function nextOccurrence(fromYmd: string, rule: Recurrence, count = 1): string {
  let cursor = parseYmd(fromYmd);
  const interval = Math.max(1, rule.interval || 1);
  for (let i = 0; i < count; i += 1) {
    if (rule.frequency === 'daily') cursor = addDays(cursor, interval);
    if (rule.frequency === 'weekly') {
      const weekdays = [...new Set(rule.byWeekday ?? [])].filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b);
      if (!weekdays.length) cursor = addDays(cursor, 7 * interval);
      else {
        const current = cursor.getUTCDay();
        const next = weekdays.find((day) => day > current);
        cursor = addDays(cursor, next === undefined ? 7 * interval - current + weekdays[0] : next - current);
      }
    }
    if (rule.frequency === 'monthly') {
      const day = cursor.getUTCDate();
      const targetMonth = cursor.getUTCMonth() + interval;
      const targetYear = cursor.getUTCFullYear() + Math.floor(targetMonth / 12);
      const month = ((targetMonth % 12) + 12) % 12;
      cursor = new Date(Date.UTC(targetYear, month, Math.min(day, daysInMonth(targetYear, month))));
    }
    if (rule.frequency === 'yearly') {
      const year = cursor.getUTCFullYear() + interval;
      const month = cursor.getUTCMonth();
      cursor = new Date(Date.UTC(year, month, Math.min(cursor.getUTCDate(), daysInMonth(year, month))));
    }
  }
  return ymd(cursor);
}

export function occurrencesUntil(fromYmd: string, rule: Recurrence, untilYmd: string, max = 100) {
  const out = [fromYmd];
  let current = fromYmd;
  while (out.length < Math.max(1, max) && current < untilYmd) {
    current = nextOccurrence(current, rule);
    if (current <= untilYmd) out.push(current);
    else break;
  }
  return out;
}
