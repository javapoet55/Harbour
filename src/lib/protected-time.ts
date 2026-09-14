import { availability, type AvailabilityContext } from './availability';
export type ProtectedTask = AvailabilityContext['tasks'][number] & { title: string; priority: string; critical?: boolean; postponeCount: number; dueAt: Date | null; updatedAt: Date; dependencyBlocked?: boolean };
export type ProtectedSlot = { taskId: string; title: string; startAt: string; endAt: string; durationMin: number; postponeCount: number; expectedUpdatedAt: string };
export function protectedTaskIds(records: Array<{ key: string; value: string }>, tasks: Array<{ id: string; startAt: Date | null; durationMin: number; status: string }>, now = new Date()) {
  return records.flatMap(record => {
    try {
      const saved = JSON.parse(record.value);
      const task = tasks.find(task => record.key === `protected:${task.id}`);
      return task && ['INBOX', 'PLANNED', 'IN_PROGRESS'].includes(task.status) && task.startAt?.toISOString() === saved.startAt && task.durationMin === saved.durationMin && +task.startAt! + task.durationMin * 60000 > +now ? [task.id] : [];
    } catch { return []; }
  });
}
export function proposeProtectedTime(context: Omit<AvailabilityContext, 'tasks'> & { tasks: ProtectedTask[] }, now: Date, protectedIds: string[] = [], dismissedIds: string[] = []): ProtectedSlot | null {
  if (context.contextWarnings?.length) return null;
  const candidates = context.tasks.filter(task => ['INBOX', 'PLANNED'].includes(task.status) && task.postponeCount >= 3 && (task.critical || ['HIGH', 'CRITICAL'].includes(task.priority)) && !task.dependencyBlocked && !protectedIds.includes(task.id) && !dismissedIds.includes(task.id))
    .sort((a, b) => b.postponeCount - a.postponeCount || +(a.dueAt ?? new Date(8640000000000000)) - +(b.dueAt ?? new Date(8640000000000000)) || a.id.localeCompare(b.id));
  for (const task of candidates) {
    const limit = new Date(Math.min(+now + 7 * 86400000, task.dueAt ? +task.dueAt : Infinity));
    if (+limit <= +now) continue;
    const slot = availability(context, new Date(Math.ceil((+now + 60000) / 300000) * 300000), limit, task.id).slots.find(slot => slot.end - slot.start >= task.durationMin * 60000);
    if (slot) return { taskId: task.id, title: task.title, startAt: new Date(slot.start).toISOString(), endAt: new Date(slot.start + task.durationMin * 60000).toISOString(), durationMin: task.durationMin, postponeCount: task.postponeCount, expectedUpdatedAt: task.updatedAt.toISOString() };
  }
  return null;
}
