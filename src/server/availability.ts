import { ScheduleWarning } from '@/lib/schedule-warning';
import { loadScheduleContext } from './schedule-intelligence';
import { explicitTimeWarnings } from '@/lib/availability';
export async function checkCreationAvailability(userId: string, start: Date, end: Date, _kind: 'task' | 'event', excludeTaskId?: string) {
  // Include adjacent local days to catch existing bookings spanning midnight.
  const from = new Date(+start - 86400000);
  const context = await loadScheduleContext(userId, from, Math.ceil((+end - +from) / 86400000) + 2, undefined, new Date());
  return explicitTimeWarnings(context, start, end, excludeTaskId);
}

export async function requireAvailableSchedule(userId: string, start: Date | null, duration: number, approved: unknown, excludeTaskId?: string) {
  if (!start) return;
  if (!Number.isFinite(+start) || !Number.isInteger(duration) || duration < 1 || duration > 1440) throw new Error('INVALID_TASK');
  if (approved === true) return;
  const warnings = await checkCreationAvailability(userId, start, new Date(+start + duration * 60000), 'task', excludeTaskId);
  if (warnings.length) throw new ScheduleWarning(warnings);
}

export async function checkOccurrenceAvailability(userId: string, occurrences: Array<{ startAt: Date; endAt: Date }>, _kind: 'task' | 'event' = 'event', excludeTaskId?: string) {
  const from = new Date(+occurrences[0].startAt - 86400000);
  const context = await loadScheduleContext(userId, from, Math.ceil((+occurrences[occurrences.length - 1].endAt - +from) / 86400000) + 2, undefined, new Date());
  const warnings = [...new Set(occurrences.flatMap(event => explicitTimeWarnings(context, event.startAt, event.endAt, excludeTaskId)))];
  if (occurrences.some((event, index) => index > 0 && +event.startAt < +occurrences[index - 1].endAt)) warnings.push('Occurrences in this series overlap each other, at their scheduled times.');
  return warnings;
}
