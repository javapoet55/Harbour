import { addDays, parseYmd, ymd } from './time';

export type Recurrence = {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
};

export function nextOccurrence(fromYmd: string, rule: Recurrence, count = 1): string {
  let cursor = parseYmd(fromYmd);
  for (let i = 0; i < count; i++) {
    if (rule.frequency === 'daily') cursor = addDays(cursor, rule.interval);
    if (rule.frequency === 'weekly') cursor = addDays(cursor, 7 * rule.interval);
    if (rule.frequency === 'monthly') {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + rule.interval, cursor.getUTCDate()));
    }
  }
  return ymd(cursor);
}

export function occurrencesUntil(fromYmd: string, rule: Recurrence, untilYmd: string, max = 24) {
  const out = [fromYmd];
  let current = fromYmd;
  while (out.length < max && current < untilYmd) {
    current = nextOccurrence(current, rule);
    if (current <= untilYmd) out.push(current);
    else break;
  }
  return out;
}
