import { z } from 'zod';
import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import { createTask, updateTask, scheduleTask, completeTask, deleteTask } from '@/server/tasks';
import { scheduleDefaultReminders } from '@/server/reminders';
import { listEventsInRange } from '@/server/agenda';
import { pushTaskToExternal } from '@/server/calendar-sync';
import { generateReplanProposal } from '@/server/replanner';

const timestamp = z.string().datetime({ offset: true });
const fields = { title: z.string().trim().min(1).max(200), notes: z.string().max(4000), scheduledAt: timestamp, durationMin: z.number().int().min(1).max(1440) };
const id = z.string().min(1).max(200);
const schemas = {
  create_task: z.object({ title: fields.title, notes: fields.notes.optional(), scheduledAt: timestamp, durationMin: fields.durationMin }).strict(),
  update_task: z.object({ taskId: id, title: fields.title.optional(), notes: fields.notes.optional(), scheduledAt: timestamp.optional(), durationMin: fields.durationMin.optional(), recurrence: z.null().optional() }).strict(),
  delete_task: z.object({ taskId: id }).strict(), complete_task: z.object({ taskId: id }).strict(),
  find_tasks: z.object({ query: z.string().trim().min(2).max(100) }).strict(),
  get_schedule: z.object({ from: timestamp, to: timestamp }).strict(),
  find_free_time: z.object({ from: timestamp, to: timestamp, durationMin: fields.durationMin }).strict(),
};
const selection = { id: true, title: true, status: true, priority: true, durationMin: true, startAt: true, dueAt: true } as const;
export function validateVoiceTool(name: string, args: unknown) {
  const schema = schemas[name as keyof typeof schemas];
  if (!schema) throw new Error('Unsupported tool');
  return schema.parse(args);
}
export async function executeVoiceTool(userId: string, sessionId: string, callId: string, name: string, input: unknown) {
  validateVoiceTool(name, input);
  const args = input as Record<string, string | number | null>;
  if (typeof args.scheduledAt === 'string' && +new Date(args.scheduledAt) <= Date.now()) throw new Error('Schedule must be in the future');
  if (name === 'find_tasks') {
    const tasks = await prisma.task.findMany({ where: { userId, deletedAt: null, title: { contains: String(args.query) } }, select: selection, take: 21, orderBy: { updatedAt: 'desc' } });
    return { success: true, tasks: tasks.slice(0, 20), truncated: tasks.length > 20 };
  }
  if (name === 'get_schedule' || name === 'find_free_time') {
    const from = new Date(String(args.from)), to = new Date(String(args.to));
    if (+to <= +from || +to - +from > 7 * 86400000) throw new Error('Use a window of at most seven days');
    // Include tasks that began before the requested window but may still overlap it.
    const [tasks, events] = await Promise.all([
      prisma.task.findMany({ where: { userId, deletedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] }, startAt: { gte: new Date(+from - 86400000), lt: to } }, select: selection, take: 201 }),
      listEventsInRange(userId, from, to),
    ]);
    if (tasks.length > 200 || events.length > 200) return { success: false, error: 'Window too busy; request a smaller range.' };
    const overlapping = tasks.filter(t => t.startAt && +t.startAt + t.durationMin * 60000 > +from);
    const busy = [...overlapping.map(t => ({ start: +t.startAt!, end: +t.startAt! + t.durationMin * 60000 })), ...events.map(e => ({ start: +e.startAt, end: +e.endAt }))].sort((a, b) => a.start - b.start);
    if (name === 'get_schedule') return { success: true, tasks: overlapping, events: events.map(e => ({ title: e.title, startAt: e.startAt, endAt: e.endAt })) };
    const slots: { from: string; to: string }[] = []; let cursor = +from;
    for (const period of [...busy, { start: +to, end: +to }]) {
      const end = Math.min(period.start, +to);
      if (end - cursor >= Number(args.durationMin) * 60000) slots.push({ from: new Date(cursor).toISOString(), to: new Date(end).toISOString() });
      cursor = Math.max(cursor, period.end);
    }
    return { success: true, slots: slots.slice(0, 20), basedOn: 'NexDo tasks and currently synced visible calendars', truncated: slots.length > 20 };
  }
  let task;
  if (name === 'create_task') {
    const key = 'voice:' + createHash('sha256').update(`${userId}:${sessionId}:${callId}`).digest('hex');
    task = await createTask({ userId, title: String(args.title), notes: args.notes as string | undefined, startAt: new Date(String(args.scheduledAt)), durationMin: Number(args.durationMin), idempotencyKey: key });
  } else {
    const owned = await prisma.task.findFirst({ where: { id: String(args.taskId), userId, deletedAt: null } });
    if (!owned) return { success: false, error: 'Task not found. Ask the user which task.' };
    if (name === 'complete_task') task = owned.status === 'COMPLETED' ? owned : await completeTask(userId, owned.id);
    else if (name === 'delete_task') task = await deleteTask(userId, owned.id);
    else {
      if (Object.keys(args).length === 1) return { success: false, error: 'No changes supplied.' };
      task = owned;
      if (args.title !== undefined || args.notes !== undefined || args.durationMin !== undefined) task = await updateTask(userId, owned.id, {
        ...(args.title !== undefined ? { title: String(args.title) } : {}), ...(args.notes !== undefined ? { notes: String(args.notes) } : {}), ...(args.durationMin !== undefined ? { durationMin: Number(args.durationMin) } : {}),
      });
      if (args.scheduledAt) task = await scheduleTask(userId, owned.id, new Date(String(args.scheduledAt)), Number(args.durationMin ?? owned.durationMin));
      if (args.recurrence === null) await prisma.recurrenceRule.deleteMany({ where: { taskId: owned.id, task: { userId } } });
    }
  }
  // A reminder failure must not disguise a successful task save as an unsaved task.
  let reminderWarning: string | undefined;
  if ((name === 'create_task' || name === 'update_task') && task.startAt) {
    try { await scheduleDefaultReminders(userId, task.id, task.startAt, Boolean(task.critical)); }
    catch { reminderWarning = 'Task saved, but reminder setup failed. Check the task reminders.'; }
  }
  if (name === 'delete_task' || name === 'complete_task') await prisma.reminder.deleteMany({ where: { taskId: task.id, userId, status: { in: ['SCHEDULED', 'QUEUED', 'RETRYING'] } } });
  const warnings: string[] = [];
  // Preserve the existing task workflow's configured calendar sync and replanning.
  // A downstream failure must not invite a duplicate task creation.
  try { await pushTaskToExternal(userId, task.id); } catch { warnings.push('Task saved, but connected calendar sync failed.'); }
  try { await generateReplanProposal(userId); } catch { warnings.push('Task saved, but schedule suggestions could not refresh.'); }
  return { success: true, warnings, task: { id: task.id, title: task.title, status: task.status, priority: task.priority, durationMin: task.durationMin, startAt: task.startAt, dueAt: task.dueAt }, reminderWarning };
}
