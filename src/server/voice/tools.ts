import { z } from 'zod';
import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import { createTask, updateTask, scheduleTask, completeTask, deleteTask } from '@/server/tasks';
import { scheduleDefaultReminders } from '@/server/reminders';
import { listEventsInRange } from '@/server/agenda';
import { pushTaskToExternal } from '@/server/calendar-sync';
import { generateReplanProposal } from '@/server/replanner';

const timestamp = z.string().datetime({ offset: true });
const fields = { title: z.string().trim().min(1).max(200), notes: z.string().max(4000), scheduledAt: timestamp, durationMin: z.number().int().min(1).max(1440), categoryName: z.string().trim().min(1).max(80) };
const id = z.string().min(1).max(200);
const schemas = {
  get_recommendations: z.object({ minutes: z.number().int().min(1).max(480).optional() }).strict(),
  list_categories: z.object({}).strict(),
  create_calendar_event: z.object({ title: fields.title, notes: fields.notes.optional(), startAt: timestamp, endAt: timestamp, location: z.string().max(200).optional() }).strict(),
  create_reminder: z.object({ title: fields.title, notes: fields.notes.optional(), categoryName: fields.categoryName.optional(), scheduledAt: timestamp }).strict(),
  create_task: z.object({ title: fields.title, notes: fields.notes.optional(), scheduledAt: timestamp, durationMin: fields.durationMin, categoryName: fields.categoryName.optional() }).strict(),
  update_task: z.object({ taskId: id, title: fields.title.optional(), notes: fields.notes.optional(), categoryName: fields.categoryName.optional(), scheduledAt: timestamp.optional(), durationMin: fields.durationMin.optional(), recurrence: z.null().optional() }).strict(),
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
  if (name === 'list_categories') {
    return { success: true, categories: await prisma.category.findMany({ where: { userId }, select: { name: true, kind: true }, take: 100 }) };
  }
  if (name === 'get_recommendations') {
    const { loadScheduleContext } = await import('@/server/schedule-intelligence');
    const { buildExecutiveRecommendation } = await import('@/lib/executive-recommendations');
    const context = await loadScheduleContext(userId);
    const { recommendation } = buildExecutiveRecommendation(context, args.minutes ? 'FREE_WINDOW' : 'NEXT_ACTION', args.minutes ? { minutes: Number(args.minutes) } : {});
    return { success: true, summary: recommendation.summary, nextAction: recommendation.nextAction, assumptions: recommendation.assumptions, timeZone: recommendation.timeZone };
  }
  if (name === 'create_calendar_event') {
    const startAt = new Date(String(args.startAt)), endAt = new Date(String(args.endAt));
    if (+startAt <= Date.now() || +endAt <= +startAt || +endAt - +startAt > 7 * 86400000) throw new Error('Clarify a future start and end within seven days');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const syncKey = 'voice-event:' + createHash('sha256').update(`${userId}:${sessionId}:${callId}`).digest('hex');
    const event = await prisma.calendarEvent.upsert({ where: { syncKey }, update: {}, create: {
      userId, title: String(args.title), notes: String(args.notes ?? ''), startAt, endAt,
      location: String(args.location ?? ''), timeZone: user.timeZone, source: 'harbor', syncKey,
    }, select: { id: true, title: true, startAt: true, endAt: true, timeZone: true } });
    return { success: true, event, savedAs: 'NexDo calendar event', message: 'Saved in NexDo Calendar. No invitations or external bookings were sent.' };
  }
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
  if (name === 'create_task' || name === 'create_reminder') {
    const key = 'voice:' + createHash('sha256').update(`${userId}:${sessionId}:${callId}`).digest('hex');
    task = await createTask({ userId, title: String(args.title), notes: args.notes as string | undefined, startAt: new Date(String(args.scheduledAt)), durationMin: name === 'create_reminder' ? 5 : Number(args.durationMin), kind: name === 'create_reminder' ? 'REMINDER' : undefined, idempotencyKey: key });
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
  const warnings: string[] = [];
  if (args.categoryName && ['create_task', 'create_reminder', 'update_task'].includes(name)) {
    try {
      const name = String(args.categoryName);
      const categories = await prisma.category.findMany({ where: { userId }, take: 100 });
      const category = categories.find(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase())
        ?? await prisma.category.create({ data: { userId, name } });
      task = await prisma.task.update({ where: { id: task.id, userId }, data: { categoryId: category.id } });
    } catch { warnings.push('Task saved, but its category could not be assigned.'); }
  }
  if (name === 'create_reminder') {
    const fireAt = new Date(String(args.scheduledAt));
    const idempotencyKey = `voice-reminder:${task.id}:${fireAt.toISOString()}`;
    try {
      await prisma.reminder.upsert({ where: { idempotencyKey }, update: {}, create: { userId, taskId: task.id, fireAt, offsetLabel: 'requested reminder', idempotencyKey } });
    } catch { warnings.push('Task saved, but its requested reminder could not be set.'); }
  }
  // A reminder failure must not disguise a successful task save as an unsaved task.
  let reminderWarning: string | undefined;
  if ((name === 'create_task' || name === 'update_task') && task.startAt) {
    try { await scheduleDefaultReminders(userId, task.id, task.startAt, Boolean(task.critical)); }
    catch { reminderWarning = 'Task saved, but reminder setup failed. Check the task reminders.'; }
  }
  if (name === 'delete_task' || name === 'complete_task') await prisma.reminder.deleteMany({ where: { taskId: task.id, userId, status: { in: ['SCHEDULED', 'QUEUED', 'RETRYING'] } } });
  // Preserve the existing task workflow's configured calendar sync and replanning.
  // A downstream failure must not invite a duplicate task creation.
  try { await pushTaskToExternal(userId, task.id); } catch { warnings.push('Task saved, but connected calendar sync failed.'); }
  try { await generateReplanProposal(userId); } catch { warnings.push('Task saved, but schedule suggestions could not refresh.'); }
  return { success: true, warnings, task: { id: task.id, title: task.title, status: task.status, priority: task.priority, durationMin: task.durationMin, startAt: task.startAt, dueAt: task.dueAt }, reminderWarning };
}
