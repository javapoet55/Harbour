import { ScheduleWarning } from '@/lib/schedule-warning';
import { loadScheduleContext } from './schedule-intelligence';
import { creationWarnings, normalizedBuffer } from '@/lib/availability';
export async function checkCreationAvailability(userId: string, start: Date, end: Date, kind: 'task' | 'event', excludeTaskId?: string) {
  // Include both adjacent local days so buffers across midnight are not lost.
  const from = new Date(+start - 86400000);
  const context = await loadScheduleContext(userId, from, Math.ceil((+end - +from) / 86400000) + 2, undefined, new Date());
  return creationWarnings(context, start, end, kind, excludeTaskId);
}

export async function requireAvailableSchedule(userId: string, start: Date | null, duration: number, approved: unknown, excludeTaskId?: string) {
  if (!start) return;
  if (!Number.isFinite(+start) || !Number.isInteger(duration) || duration < 1 || duration > 1440) throw new Error('INVALID_TASK');
  if (approved === true) return;
  const warnings = await checkCreationAvailability(userId, start, new Date(+start + duration * 60000), 'task', excludeTaskId);
  if (warnings.length) throw new ScheduleWarning(warnings);
}

export async function checkOccurrenceAvailability(userId: string, occurrences: Array<{ startAt: Date; endAt: Date }>, kind: 'task' | 'event' = 'event', excludeTaskId?: string) {
  const from = new Date(+occurrences[0].startAt - 86400000);
  const context = await loadScheduleContext(userId, from, Math.ceil((+occurrences[occurrences.length - 1].endAt - +from) / 86400000) + 2, undefined, new Date());
  const warnings = [...new Set(occurrences.flatMap(event => creationWarnings(context, event.startAt, event.endAt, kind, excludeTaskId)))];
  const buffer = kind === 'event' ? normalizedBuffer(context.bufferMinutes) * 60000 : 0;
  if (occurrences.some((event, index) => index > 0 && +event.startAt - buffer < +occurrences[index - 1].endAt + buffer)) warnings.push('Occurrences in this series overlap each other, including appointment buffers.');
  return warnings;
}
