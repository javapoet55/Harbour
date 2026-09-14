import { calendarBusy, freeSlots } from './schedule-intelligence';
import { workWindows } from './replanning';
export const normalizedBuffer = (value: unknown) => {
  const minutes = Number(value ?? 15);
  return Number.isFinite(minutes) ? Math.max(0, Math.min(120, minutes)) : 15;
};
export type AvailabilityContext = {
  timeZone: string; workingDays: string; workStart: string; workEnd: string; bufferMinutes: number;
  tasks: Array<{ id: string; startAt: Date | null; durationMin: number; status: string }>;
  events: Array<{ id: string; title: string; startAt: Date; endAt: Date; allDay?: boolean }>;
  contextWarnings?: string[];
  activeFocus?: { taskId: string; startedAt: number; endsAt: number } | null;
};
export function availability(context: AvailabilityContext, from: Date, to: Date, excludeTaskId?: string) {
  const days = Math.min(368, Math.ceil((+to - +from) / 86400000) + 1);
  const windows = workWindows(context.timeZone, context.workingDays, context.workStart, context.workEnd, days, from, 0)
    .map(window => ({ start: Math.max(+from, window.start), end: Math.min(+to, window.end) })).filter(window => window.end > window.start);
  const busy = [...calendarBusy(context.events, normalizedBuffer(context.bufferMinutes)), ...context.tasks
    .filter(task => task.id !== excludeTaskId && !['COMPLETED', 'CANCELLED'].includes(task.status) && task.startAt)
    .map(task => ({ start: +task.startAt!, end: +task.startAt! + task.durationMin * 60000 }))];
  if (context.activeFocus && context.activeFocus.taskId !== excludeTaskId && context.activeFocus.endsAt > +from) busy.push({ start: context.activeFocus.startedAt, end: context.activeFocus.endsAt });
  return { windows, busy, slots: windows.flatMap(window => freeSlots(window.start, window.end, busy)) };
}
export function creationWarnings(context: AvailabilityContext, start: Date, end: Date, kind: 'task' | 'event', excludeTaskId?: string) {
  const buffer = kind === 'event' ? normalizedBuffer(context.bufferMinutes) * 60000 : 0;
  const from = new Date(+start - buffer), to = new Date(+end + buffer);
  const { windows, busy } = availability(context, from, to, excludeTaskId);
  const warnings = [...(context.contextWarnings ?? [])];
  if (!windows.some(window => window.start <= +from && window.end >= +to)) warnings.push('This time, including appointment buffers, is outside your saved working hours.');
  if (busy.some(block => block.start < +to && block.end > +from)) warnings.push('This time overlaps existing work or the buffer around an appointment.');
  return [...new Set(warnings)];
}
