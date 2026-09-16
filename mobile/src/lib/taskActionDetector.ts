import { startOfDay } from './taskQuery';
import type { TaskActionChannel } from './todayActionQueue';

/**
 * `DeterministicTaskActionDetector` (ios/Sources/NexdoCore/TaskActionDetector.swift:4-77) —
 * "Conservative English V1 parser. Missing/ambiguous times remain unscheduled."
 *
 * It turns a task TITLE into a contact action: who to contact, over which channel, about what, and
 * when. Nothing else in the app produces a `TaskAction`, so this is the whole input side of the
 * reminder system.
 *
 * All the date arithmetic runs in the ACCOUNT time zone, like every other date helper here, through
 * `startOfDay` from `taskQuery.ts` — Swift builds a `Calendar` with the passed `timeZone` for the
 * same reason.
 */

/** `TaskActionIntent` (ios/Sources/NexdoCore/TaskAction.swift:3-5). */
export type TaskActionIntent = 'contact' | 'call' | 'message' | 'email' | 'followUp' | 'schedule' | 'openURL' | 'navigate' | 'book' | 'remind';

/** `DetectedTaskAction` (TaskAction.swift:11-17). */
export type DetectedTaskAction = {
  intent: TaskActionIntent;
  contactName: string;
  preferredAction: TaskActionChannel | null;
  /** Epoch ms, or `null` when the title carries no usable time. */
  scheduledAt: number | null;
  context: string | null;
};

/** `^(contact|call|email|message|text|follow\s+up\s+with)\s+(.+)$` (TaskActionDetector.swift:9). */
const VERB = /^(contact|call|email|message|text|follow\s+up\s+with)\s+([\s\S]+)$/i;

/** A tail that starts with a preposition or a day word has no name in it (`:13`). */
const TAIL_STARTS_WITH_TIME = /^(?:at|about|regarding|today|tomorrow|tonight|on)\b/i;

/** Where the contact name ends (`:14`). */
const NAME_END =
  /\s+(?:to\s+(?:confirm|discuss|arrange|review)\b|at\b|about\b|regarding\b|on\b|today\b|tomorrow\b|tonight\b|this\b|next\b|monday\b|tuesday\b|wednesday\b|thursday\b|friday\b|saturday\b|sunday\b)/i;

/** The "about …" / "to discuss …" context (`:26`). */
const CONTEXT_START = /\b(?:about|regarding|to(?=\s+(?:confirm|discuss|arrange|review)\b))\s+/i;

/** Where a context stops, so a trailing time never becomes part of it (`:28`). */
const CONTEXT_END = /\s+(?:at\s+\d|tomorrow\b|tonight\b|on\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))/i;

/** `\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b` (`:39`). */
const CLOCK = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** Swift trims whitespace AND punctuation off both ends of the name and the context. */
function trimNameOrContext(value: string): string {
  // `CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters)` — Unicode punctuation, which
  // for these titles means the ASCII marks plus curly quotes and dashes.
  return value.replace(/^[\s!-#%-*,-/:;?@[-\]_{}¡«·»¿‐-‧‰-⁞]+/u, '')
    .replace(/[\s!-#%-*,-/:;?@[-\]_{}¡«·»¿‐-‧‰-⁞]+$/u, '');
}

/**
 * `detect(title:now:timeZone:)` (TaskActionDetector.swift:6-33).
 *
 * Returns `null` unless the title begins with one of the six verbs AND carries a name that is at most
 * five words, at most 100 characters, and contains a letter.
 */
export function detectTaskAction(title: string, now: number, timeZone: string): DetectedTaskAction | null {
  const text = title.trim();
  const match = VERB.exec(text);
  if (!match) return null;

  const verb = match[1].toLowerCase();
  const tail = match[2];
  if (TAIL_STARTS_WITH_TIME.test(tail)) return null;

  const nameEnd = NAME_END.exec(tail);
  const rawName = nameEnd ? tail.slice(0, nameEnd.index) : tail;
  const name = trimNameOrContext(rawName);
  if (name.length === 0 || name.length > 100) return null;
  if (name.split(' ').filter((part) => part.length > 0).length > 5) return null;
  if (!/\p{L}/u.test(name)) return null;

  const intent: TaskActionIntent =
    verb === 'call' ? 'call'
      : verb === 'email' ? 'email'
        : verb === 'message' || verb === 'text' ? 'message'
          : verb.startsWith('follow') ? 'followUp'
            : 'contact';
  const channel: TaskActionChannel | null =
    intent === 'call' ? 'call' : intent === 'email' ? 'email' : intent === 'message' ? 'message' : null;

  const suffix = nameEnd ? tail.slice(nameEnd.index) : '';

  let context: string | null = null;
  const about = CONTEXT_START.exec(suffix);
  if (about) {
    let value = suffix.slice(about.index + about[0].length);
    const end = CONTEXT_END.exec(value);
    if (end) value = value.slice(0, end.index);
    value = trimNameOrContext(value);
    if (value.length > 0) context = value;
  }

  return { intent, contactName: name, preferredAction: channel, scheduledAt: parseTime(suffix, now, timeZone), context };
}

/**
 * `parseTime(_:now:timeZone:)` (TaskActionDetector.swift:35-76).
 *
 * The one place a task title becomes a reminder time. Exported because the creation form shows the
 * result (`RootView.swift:1983-1986`), and because the Swift tests pin it directly.
 *
 * Returns epoch ms, or `null` when the text carries no hour — "Call Damien" never schedules anything.
 */
export function parseTime(value: string, now: number, timeZone: string): number | null {
  const lower = value.toLowerCase();
  let hour: number | null = null;
  let minute = 0;

  const clock = CLOCK.exec(value);
  if (clock) {
    const number = Number.parseInt(clock[1], 10);
    if (!Number.isFinite(number) || number < 1 || number > 12) return null;
    if (clock[2] !== undefined) {
      minute = Number.parseInt(clock[2], 10);
      if (!Number.isFinite(minute)) minute = 0;
    }
    if (minute >= 60) return null;
    // `number % 12 + (pm ? 12 : 0)`: 12 AM is 0, 12 PM is 12.
    hour = (number % 12) + (clock[3].toLowerCase().startsWith('p') ? 12 : 0);
  } else if (lower.includes('morning')) hour = 9;
  else if (lower.includes('afternoon')) hour = 14;
  else if (lower.includes('tonight') || lower.includes('evening')) hour = 19;

  let day = startOfDay(now, timeZone);
  let explicitDay = false;

  if (lower.includes('tomorrow')) {
    day = addDaysTo(day, 1, timeZone);
    explicitDay = true;
  } else {
    const index = WEEKDAYS.findIndex((weekday) => new RegExp(`\\b${weekday}\\b`).test(lower));
    if (index >= 0) {
      // `(index + 1 - calendar.component(.weekday, from: now) + 7) % 7`, where Swift's `.weekday` is
      // 1 for Sunday; `weekdayOf` returns the same 1-7 numbering in the account zone.
      let delta = (index + 1 - weekdayOf(now, timeZone) + 7) % 7;
      if (lower.includes('next ') && delta === 0) delta = 7;
      day = addDaysTo(day, delta, timeZone);
      explicitDay = true;
      if (hour === null) hour = 9;
    } else if (lower.includes('today') || lower.includes('tonight')) {
      explicitDay = true;
    }
  }

  if (hour === null) return null;

  let result = setClock(day, hour, minute, timeZone);
  // "Call Ana at 8 AM" at 9 AM today means 8 AM TOMORROW; an explicit day is never moved.
  if (!explicitDay && result <= now) result = setClock(addDaysTo(day, 1, timeZone), hour, minute, timeZone);
  return result;
}

/**
 * `calendar.date(byAdding: .day, value:)` in the account zone. `taskQuery.addDays` walks whole days
 * from a midnight, which is the same operation across a DST boundary.
 */
function addDaysTo(midnight: number, days: number, timeZone: string): number {
  if (days === 0) return midnight;
  // Step through noon so a 23- or 25-hour day cannot land on the wrong date.
  const stepped = midnight + days * 86_400_000;
  return startOfDay(stepped + 12 * 3_600_000, timeZone);
}

/** `calendar.date(bySettingHour:minute:second:of:)` in the account zone. */
function setClock(midnight: number, hour: number, minute: number, timeZone: string): number {
  // Midnight plus the wall-clock offset, re-anchored so a DST shift on that day is absorbed.
  const naive = midnight + hour * 3_600_000 + minute * 60_000;
  const actual = hourMinuteOf(naive, timeZone);
  const drift = (actual.hour - hour) * 60 + (actual.minute - minute);
  return naive - drift * 60_000;
}

function parts(at: number, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return Object.fromEntries(formatter.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
}

function hourMinuteOf(at: number, timeZone: string): { hour: number; minute: number } {
  const value = parts(at, timeZone);
  // `hour12: false` renders midnight as "24" in some engines.
  return { hour: Number(value.hour) % 24, minute: Number(value.minute) };
}

/** Swift's `Calendar.component(.weekday,…)`: Sunday is 1 through Saturday 7. */
function weekdayOf(at: number, timeZone: string): number {
  const short = parts(at, timeZone).weekday;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short) + 1;
}
