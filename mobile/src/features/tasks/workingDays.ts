import type { DoNowNext } from '../../api/types';

/**
 * Working days (d568989): `ProfilePreferences.workingDays` (ios/Sources/NexdoCore/ProfileSettings.swift)
 * and Settings' `WorkingDaysField` (ios/App/ProfileView.swift). "Find my next task" uses these days
 * with the working hours; the server's own default is Monday to Friday.
 *
 * On the wire it is a comma list of weekday numbers, 0 = Sunday, which the server checks against
 * `^[0-6](?:,[0-6])*$` (src/app/api/settings/route.ts:29). It is not nullable there: omit it, never null.
 */

export const DEFAULT_WORKING_DAYS = '1,2,3,4,5';

/** The toggles' labels, Sunday first, in the order Swift lists them. */
export const WORKING_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const WORKING_DAYS_FOOTNOTE = 'Choose at least one day. Find my next task uses these days and your working hours.';

/** `selected`: the days in a stored value. Unreadable entries are skipped, as `Int($0)` does. */
export function workingDaySet(value: string | null | undefined): Set<number> {
  return new Set((value ?? DEFAULT_WORKING_DAYS).split(',').map((part) => Number(part)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
}

/** `selection(_:)`'s setter: turn a day on or off, but never the last one off. Sorted, as Swift writes it. */
export function toggleWorkingDay(value: string | null | undefined, day: number, enabled: boolean): string {
  const days = workingDaySet(value);
  if (enabled) days.add(day);
  else if (days.size > 1) days.delete(day);
  return [...days].sort((left, right) => left - right).join(',');
}

/** A day's toggle is disabled when it is the only one on. */
export function workingDayLocked(value: string | null | undefined, day: number): boolean {
  const days = workingDaySet(value);
  return days.size === 1 && days.has(day);
}

/**
 * Do Now's window line (ios/App/DoNowView.swift, d568989): an excluded day is said before the hours,
 * so a Saturday no longer reads as "Outside your working hours". TODO(screens): do-now.tsx still
 * builds the old two-way text inline.
 */
export function doNowWindowTitle(next: Pick<DoNowNext, 'outsideWorkingDay' | 'outsideWorkingHours' | 'availableWindowMinutes'>, durationLabel: (minutes: number) => string): string {
  if (next.outsideWorkingDay === true) return 'Today isn’t a selected working day';
  if (next.outsideWorkingHours === true) return 'Outside your working hours';
  return `You have ${durationLabel(next.availableWindowMinutes)} free now`;
}

/**
 * Today's schedule card (RootView.swift, d568989): three items, then "View N more" EXPANDS the card in
 * place ("Show less" folds it) instead of opening Calendar; a search shows everything; changing the
 * range folds it again. TODO(screens): TodayIntelligenceCard still shows seven and links to Calendar.
 */
export const TODAY_SCHEDULE_PREVIEW = 3;

export function visibleScheduleItems<T>(schedule: T[], searching: boolean, expanded: boolean): T[] {
  return searching || expanded ? schedule : schedule.slice(0, TODAY_SCHEDULE_PREVIEW);
}

/** The button under the card, or `null` when there is nothing more to show. */
export function scheduleExpandLabel(count: number, searching: boolean, expanded: boolean): string | null {
  if (searching || count <= TODAY_SCHEDULE_PREVIEW) return null;
  return expanded ? 'Show less' : `View ${count - TODAY_SCHEDULE_PREVIEW} more`;
}
