import { addDays, startOfDay } from './taskQuery';

/**
 * Port of `TaskCreationDate` (ios/Sources/NexdoCore/TaskSaveInput.swift:24-39).
 *
 * The raw values are the button labels on the creation form.
 */
export const TASK_CREATION_DATES = ['Today', 'Tomorrow', 'Select Date'] as const;
export type TaskCreationDate = (typeof TASK_CREATION_DATES)[number];

/**
 * `TaskCreationDate.resolve(customDate:timeZone:now:)`.
 *
 * Today is `now` exactly — the current instant, not midnight — because the server assigns both
 * `startAt` and `dueAt` from it and a midnight `startAt` would schedule the task at the top of the
 * day. Tomorrow is the same wall-clock time a day later. A chosen date keeps the CURRENT hour and
 * minute, so picking a day never silently schedules for midnight either.
 */
export function creationDateFor(
  choice: TaskCreationDate,
  timeZone: string,
  customDate: number = Date.now(),
  now: number = Date.now(),
): number {
  switch (choice) {
    case 'Today':
      return now;
    case 'Tomorrow':
      return addDays(startOfDay(now, timeZone), 1, timeZone) + timeOfDay(now, timeZone);
    case 'Select Date':
      return startOfDay(customDate, timeZone) + timeOfDay(now, timeZone);
  }
}

/** Milliseconds since the local midnight of the day containing `at`. */
function timeOfDay(at: number, timeZone: string): number {
  return at - startOfDay(at, timeZone);
}
