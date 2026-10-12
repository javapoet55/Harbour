import type { CalendarEvent, NexdoTask } from '../../api/types';
import type { ImportantMoment } from '../../api/moments';
import { isoString, momentDate, momentDay, nextOccurrence } from '../moments/dates';
import { isArchived, typeLabel } from '../moments/domain';
import { addDays } from '../../lib/taskQuery';

/**
 * `MomentSchedule` (bb57e09, ios/Sources/NexdoCore/MomentSchedule.swift): Moments shown in Calendar
 * and Tasks as read-only entries. They are projections built on the device from the moments list —
 * never saved as tasks or events, and never sent to the server. Their ids carry a `moment:` prefix,
 * which is how a tap is routed back to the moment (`momentIdFromEntry`).
 */

const PREFIX = 'moment:';
/** `":yyyy-MM-dd"`, the day suffix every entry id ends with. */
const DAY_SUFFIX = 11;

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** `"moment:<id>:<yyyy-MM-dd>"`. */
export function momentEntryId(momentId: string, day: string): string {
  return `${PREFIX}${momentId}:${day}`;
}

/** `momentID(_:)` (:6-9): the moment behind a Calendar or Tasks entry, or `null` for anything else. */
export function momentIdFromEntry(entryId: string): string | null {
  if (!entryId.startsWith(PREFIX) || entryId.length <= PREFIX.length + DAY_SUFFIX) return null;
  return entryId.slice(PREFIX.length, entryId.length - DAY_SUFFIX);
}

/** Whether a Calendar or Tasks entry is a Moment projection, which has no task or event behind it. */
export function isMomentEntry(entryId: string): boolean {
  return momentIdFromEntry(entryId) !== null;
}

type ScheduledMoment = Pick<ImportantMoment, 'id' | 'type' | 'title' | 'occurrenceDate' | 'yearly' | 'enabled' | 'festivalSettings'>;

/**
 * `occurs(_:on:)` (:10-17): a moment shows on its own CALENDAR date — not on the day its reminder or
 * message is sent. Off and archived moments never show. A yearly 29 February shows on the 28th in a
 * common year, the server's rule too.
 */
export function momentOccursOn(moment: ScheduledMoment, day: string): boolean {
  if (!moment.enabled || isArchived(moment) || day.length !== 10 || moment.occurrenceDate.length !== 10) return false;
  if (!moment.yearly) return moment.occurrenceDate === day;
  const year = Number(day.slice(0, 4));
  if (!Number.isInteger(year)) return false;
  const suffix = moment.occurrenceDate.slice(-5);
  return day.slice(-5) === (suffix === '02-29' && !isLeap(year) ? '02-28' : suffix);
}

/** The notes line both projections carry (`typeLabel + " · Moment"`). */
export function momentEntryNotes(moment: Pick<ImportantMoment, 'type'>): string {
  return `${typeLabel(moment.type)} · Moment`;
}

/**
 * `events(_:days:timeZone:)` (:18-31): one all-day event per moment per visible day it falls on,
 * midnight to midnight in the profile zone, `source: "moment"`.
 */
export function momentEvents(moments: ScheduledMoment[], days: string[], timeZone: string): CalendarEvent[] {
  return moments.flatMap((moment) =>
    days
      .filter((day) => momentOccursOn(moment, day))
      .map((day) => {
        const start = momentDate(day, timeZone);
        return {
          id: momentEntryId(moment.id, day),
          title: moment.title,
          startAt: isoString(start),
          endAt: isoString(addDays(start, 1, timeZone)),
          allDay: true,
          notes: momentEntryNotes(moment),
          location: null,
          timeZone,
          source: 'moment',
          connectionId: null,
          completedAt: null,
        };
      }),
  );
}

/**
 * `tasks(_:timeZone:now:)` (:32-53): open, zero-minute tasks at midnight of each occurrence, so the
 * existing date pills place them. A yearly moment yields its next occurrence plus this year's and
 * last year's (which keeps December's birthday in January's "Last Month" history); duplicates collapse.
 */
export function momentTasks(moments: ScheduledMoment[], timeZone: string, now: number = Date.now()): NexdoTask[] {
  const year = Number(momentDay(now, timeZone).slice(0, 4));
  return moments
    .filter((moment) => moment.enabled && !isArchived(moment))
    .flatMap((moment) => {
      const days = new Set([moment.yearly ? nextOccurrence(moment.occurrenceDate, true, timeZone, now) : moment.occurrenceDate]);
      if (moment.yearly) {
        const suffix = moment.occurrenceDate.slice(-5);
        for (let y = year - 1; y <= year; y++) days.add(`${y}-${suffix === '02-29' && !isLeap(y) ? '02-28' : suffix}`);
      }
      return [...days]
        .sort()
        .filter((day) => momentOccursOn(moment, day))
        .map((day) => ({
          id: momentEntryId(moment.id, day),
          title: moment.title,
          status: 'PLANNED',
          priority: 'NORMAL',
          durationMin: 0,
          notes: momentEntryNotes(moment),
          startAt: isoString(momentDate(day, timeZone)),
          dueAt: null,
        }));
    });
}
