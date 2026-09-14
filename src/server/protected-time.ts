import { prisma } from './db';
import { loadScheduleContext } from './schedule-intelligence';
import { protectedTaskIds, proposeProtectedTime } from '@/lib/protected-time';
import { creationWarnings } from '@/lib/availability';
import { scheduleDefaultReminders } from './reminders';
import { pushTaskToExternal } from './calendar-sync';

export async function getProtectedTimeProposal(userId: string, now = new Date()) {
  const context = await loadScheduleContext(userId, now);
  if (!context.user.preference?.personalizationEnabled) return { proposal: null };
  const records = await prisma.userMemory.findMany({ where: { userId, kind: { in: ['protected_time', 'protected_dismissal'] } } });
  const tasks = context.tasks.map(task => ({ ...task, durationMin: task.calendarDurationMin }));
  const dismissed = records.filter(record => record.kind === 'protected_dismissal' && +record.updatedAt + 86400000 > +now).flatMap(record => {
    try { const value = JSON.parse(record.value); return tasks.some(task => record.key === `protected-dismiss:${task.id}` && value.postponeCount === task.postponeCount) ? [record.key.slice('protected-dismiss:'.length)] : []; } catch { return []; }
  });
  return { proposal: proposeProtectedTime({ ...context, tasks }, now, protectedTaskIds(records, tasks, now), dismissed) };
}
export async function respondProtectedTime(userId: string, input: { action: 'accept' | 'dismiss'; taskId: string; startAt: string; expectedUpdatedAt: string }, now = new Date()) {
  await prisma.$transaction(async tx => {
    const context = await loadScheduleContext(userId, now, 8, tx);
    const task = context.tasks.find(task => task.id === input.taskId);
    if (!context.user.preference?.personalizationEnabled || !task || task.updatedAt.toISOString() !== input.expectedUpdatedAt || !['INBOX', 'PLANNED'].includes(task.status) || task.dependencyBlocked || task.postponeCount < 3 || !(task.critical || ['HIGH', 'CRITICAL'].includes(task.priority))) throw new Error('STALE_PROTECTED_TIME');
    if (input.action === 'dismiss') {
      const key = `protected-dismiss:${task.id}`, value = JSON.stringify({ postponeCount: task.postponeCount });
      await tx.userMemory.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, value, kind: 'protected_dismissal', source: 'user' }, update: { value, updatedAt: now } });
      return;
    }
    const start = new Date(input.startAt), end = new Date(+start + task.calendarDurationMin * 60000);
    const savedContext = { ...context, tasks: context.tasks.map(task => ({ ...task, durationMin: task.calendarDurationMin })) };
    if (+start < +now || +end > +now + 7 * 86400000 || task.dueAt && +end > +task.dueAt || creationWarnings(savedContext, start, end, 'task', task.id).length) throw new Error('STALE_PROTECTED_TIME');
    const changed = await tx.task.updateMany({ where: { id: task.id, userId, updatedAt: task.updatedAt }, data: { startAt: start, status: 'PLANNED' } });
    if (changed.count !== 1) throw new Error('STALE_PROTECTED_TIME');
    const key = `protected:${task.id}`, value = JSON.stringify({ startAt: start.toISOString(), durationMin: task.calendarDurationMin });
    await tx.userMemory.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, value, kind: 'protected_time', source: 'user' }, update: { value, updatedAt: now } });
    await tx.activityLog.create({ data: { userId, taskId: task.id, kind: 'PROTECTED_TIME', summary: `Reserved ${task.calendarDurationMin} minutes at ${start.toISOString()} after ${task.postponeCount} postponements` } });
  }, { isolationLevel: 'Serializable' });
  const warnings: string[] = [];
  if (input.action === 'accept') {
    const task = await prisma.task.findFirstOrThrow({ where: { id: input.taskId, userId } });
    const results = await Promise.allSettled([scheduleDefaultReminders(userId, task.id, task.startAt!, task.critical), pushTaskToExternal(userId, task.id)]);
    if (results.some(result => result.status === 'rejected')) warnings.push('Time is reserved in Nexdo; reminders or external calendar synchronization need a retry.');
  }
  return { ok: true, warnings };
}
