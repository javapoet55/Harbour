import { loadScheduleContext } from './schedule-intelligence';
import { creationWarnings } from '@/lib/availability';
export async function checkCreationAvailability(userId: string, start: Date, end: Date, kind: 'task' | 'event', excludeTaskId?: string) {
  // Include both adjacent local days so buffers across midnight are not lost.
  const from = new Date(+start - 86400000);
  const context = await loadScheduleContext(userId, from, Math.ceil((+end - +from) / 86400000) + 2, undefined, new Date());
  return creationWarnings(context, start, end, kind, excludeTaskId);
}
