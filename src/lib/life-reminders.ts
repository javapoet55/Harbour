import { addDays, parseYmd, tzToday, ymd, zonedDateTime } from './time';

export const LIFE_REMINDER_TYPES = ['returnItem', 'bill', 'expiration', 'maintenance', 'subscription', 'renewal', 'general'] as const;
export type LifeReminderType = typeof LIFE_REMINDER_TYPES[number];
export type LifeReminderUrgency = 'normal' | 'upcoming' | 'soon' | 'urgent' | 'overdue';

export type LifeReminderRecurrence = {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byWeekday?: number[];
  until?: Date | null;
  count?: number | null;
};

export type LifeReminderIntent = {
  title: string;
  reminderType: LifeReminderType;
  dueDate: Date | null;
  reminderDate: Date | null;
  recurrenceRule: LifeReminderRecurrence | null;
  confidence: number;
  originalUserText: string;
  recognized: boolean;
};

const numberWords: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function amount(value: string | undefined, fallback = 1) {
  if (!value) return fallback;
  return Number(value) || numberWords[value.toLowerCase()] || fallback;
}

function addMonths(anchor: Date, count: number) {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + count;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(anchor.getUTCDate(), lastDay)));
}

function atLocal(anchor: Date, time: string, timeZone: string) {
  return zonedDateTime(ymd(anchor), time, timeZone);
}

function clock(text: string, fallback = '09:00') {
  const match = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return fallback;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (match[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (match[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function explicitDate(text: string, today: Date, timeZone: string) {
  const match = text.match(new RegExp(`\\b(${months.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'));
  if (!match) return null;
  const month = months.indexOf(match[1].toLowerCase());
  let year = match[3] ? Number(match[3]) : today.getUTCFullYear();
  const day = Number(match[2]);
  let anchor = new Date(Date.UTC(year, month, day));
  if (anchor.getUTCMonth() !== month) return null;
  if (!match[3] && anchor < today) anchor = new Date(Date.UTC(++year, month, day));
  try { return atLocal(anchor, clock(text), timeZone); } catch { return null; }
}

function classify(text: string): LifeReminderType {
  if (/\b(return|refund|send back|package)\b/i.test(text)) return 'returnItem';
  if (/\b(bill|invoice|electricity|utility|pg&e|phone payment)\b/i.test(text)) return 'bill';
  if (/\b(trial|subscription|streaming|cancel membership)\b/i.test(text)) return 'subscription';
  if (/\b(replace|change|service|inspect|filter|maintenance)\b/i.test(text)) return 'maintenance';
  if (/\b(renew|renewal|passport|registration|license)\b/i.test(text)) return 'renewal';
  if (/\b(expire|expires|expiration|warranty)\b/i.test(text)) return 'expiration';
  return 'general';
}

function cleanTitle(text: string, type: LifeReminderType) {
  let title = text
    .replace(/^\s*(hey\s+nexdo[, ]*)?/i, '')
    .replace(/^\s*(please\s+)?remind me(?:\s+to)?\s*/i, '')
    .replace(/\.?\s*remind me\s+(?:[a-z0-9-]+\s+){0,3}before\.?\s*$/i, '')
    .replace(/\b(?:in\s+)?(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(?:days?|weeks?|months?)\b/ig, '')
    .replace(/\b(?:tomorrow|tonight|next week|next (?:sun|mon|tues|wednes|thurs|fri|satur)day)\b/ig, '')
    .replace(/\b(?:on\s+)?the\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?every month\b/ig, '')
    .replace(/\bevery\s+(?:(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+)?(?:days?|weeks?|months?|years?)\b/ig, '')
    .replace(/\b(?:on|by|before)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/ig, '')
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/ig, '')
    .replace(/\b(?:on\s+)?the\s+\d{1,2}(?:st|nd|rd|th)?\b/ig, '')
    .replace(/\s+/g, ' ').trim().replace(/^to\s+/i, '').replace(/[.,]\s*$/, '').trim();
  if (type === 'renewal' && /registration\s+expires/i.test(text)) title = 'Renew vehicle registration';
  title = title.replace(/^my\s+/i, '').replace(/\s+expires?$/i, '').trim();
  if (!title) title = 'Reminder';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Shared, deterministic fallback used by typed Quick Add and voice tool execution. */
export function parseLifeReminder(text: string, timeZone: string, now = new Date()): LifeReminderIntent {
  const originalUserText = text.trim();
  const today = tzToday(timeZone, now);
  const type = classify(originalUserText);
  const reminderLanguage = /\b(remind|return|bill|expire|renew|trial|subscription|replace|maintenance|filter)\b/i.test(originalUserText);
  let dueDate: Date | null = null;
  let reminderDate: Date | null = null;
  let recurrenceRule: LifeReminderRecurrence | null = null;

  const recurring = originalUserText.match(/\bevery\s+(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+)?(day|week|month|year)s?\b/i);
  const monthlyDay = originalUserText.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?every month\b/i)
    ?? originalUserText.match(/\bevery month(?:\s+on)?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (recurring || monthlyDay) {
    const unit = monthlyDay ? 'month' : recurring![2].toLowerCase();
    recurrenceRule = { frequency: `${unit.toUpperCase()}LY` as LifeReminderRecurrence['frequency'], interval: monthlyDay ? 1 : amount(recurring![1]) };
    let anchor = today;
    if (monthlyDay) {
      const day = Math.min(31, Number(monthlyDay[1]));
      anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), Math.min(day, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate())));
      if (anchor < today) anchor = addMonths(anchor, 1);
    } else if (unit === 'day') anchor = addDays(today, recurrenceRule.interval);
    else if (unit === 'week') anchor = addDays(today, recurrenceRule.interval * 7);
    else if (unit === 'month') anchor = addMonths(today, recurrenceRule.interval);
    else anchor = addMonths(today, recurrenceRule.interval * 12);
    reminderDate = dueDate = atLocal(anchor, clock(originalUserText), timeZone);
  }

  if (!dueDate) {
    const absolute = explicitDate(originalUserText, today, timeZone);
    if (absolute) dueDate = reminderDate = absolute;
  }
  if (!dueDate) {
    const relative = originalUserText.match(/\bin\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(day|week|month)s?\b/i);
    if (relative) {
      const count = amount(relative[1]);
      const anchor = relative[2].toLowerCase() === 'month' ? addMonths(today, count) : addDays(today, count * (relative[2].toLowerCase() === 'week' ? 7 : 1));
      dueDate = reminderDate = atLocal(anchor, clock(originalUserText), timeZone);
    } else if (/\btomorrow\b/i.test(originalUserText)) dueDate = reminderDate = atLocal(addDays(today, 1), clock(originalUserText), timeZone);
    else if (/\btonight\b/i.test(originalUserText)) dueDate = reminderDate = atLocal(today, clock(originalUserText, '20:00'), timeZone);
    else if (/\bnext week\b/i.test(originalUserText)) dueDate = reminderDate = atLocal(addDays(today, 7), clock(originalUserText), timeZone);
    else {
      const nextDay = originalUserText.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
      if (nextDay) {
        const target = weekdays.indexOf(nextDay[1].toLowerCase());
        const delta = ((target - today.getUTCDay() + 7) % 7) || 7;
        dueDate = reminderDate = atLocal(addDays(today, delta), clock(originalUserText), timeZone);
      }
    }
  }

  const before = originalUserText.match(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(day|week|month)s?\s+before\b/i);
  if (dueDate && before) {
    const count = amount(before[1]);
    const dueAnchor = parseYmd(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dueDate));
    const reminderAnchor = before[2].toLowerCase() === 'month' ? addMonths(dueAnchor, -count) : addDays(dueAnchor, -count * (before[2].toLowerCase() === 'week' ? 7 : 1));
    reminderDate = atLocal(reminderAnchor, clock(originalUserText), timeZone);
  }

  const recognized = Boolean(reminderLanguage && (dueDate || recurrenceRule || type !== 'general'));
  return {
    title: cleanTitle(originalUserText, type), reminderType: type, dueDate, reminderDate, recurrenceRule,
    confidence: recognized ? (dueDate || recurrenceRule ? 0.96 : 0.78) : 0, originalUserText, recognized,
  };
}

export function lifeReminderUrgency(target: Date, now = new Date()): LifeReminderUrgency {
  const days = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
  if (target < now) return 'overdue';
  if (days <= 1) return 'urgent';
  if (days <= 7) return 'soon';
  if (days <= 30) return 'upcoming';
  return 'normal';
}

export function lifeReminderBriefLabel(type: LifeReminderType, target: Date, now = new Date()) {
  const days = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return type === 'expiration' || type === 'renewal' ? 'Expired' : 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (type === 'expiration' || type === 'renewal') return `Expires in ${days} days`;
  return `${days} days left`;
}
