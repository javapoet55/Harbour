import { voiceClock } from './time-context';
import { ScheduleWarning } from '@/lib/schedule-warning';
import { checkCreationAvailability } from '@/server/availability';
import { availability } from '@/lib/availability';
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
  get_current_time: z.object({}).strict(),
  get_recommendations: z.object({ minutes: z.number().int().min(1).max(480).optional() }).strict(),
  list_categories: z.object({}).strict(),
  create_calendar_event: z.object({ allowScheduleConflict: z.boolean().optional(), title: fields.title, notes: fields.notes.optional(), startAt: timestamp, endAt: timestamp, location: z.string().max(200).optional() }).strict(),
  create_reminder: z.object({ title: fields.title, notes: fields.notes.optional(), categoryName: fields.categoryName.optional(), scheduledAt: timestamp }).strict(),
  create_task: z.object({ allowScheduleConflict: z.boolean().optional(), title: fields.title, notes: fields.notes.optional(), scheduledAt: timestamp, durationMin: fields.durationMin, categoryName: fields.categoryName.optional() }).strict(),
  update_task: z.object({ allowScheduleConflict: z.boolean().optional(), taskId: id, title: fields.title.optional(), notes: fields.notes.optional(), categoryName: fields.categoryName.optional(), scheduledAt: timestamp.optional(), durationMin: fields.durationMin.optional(), recurrence: z.null().optional() }).strict(),
  delete_task: z.object({ taskId: id }).strict(), complete_task: z.object({ allowScheduleConflict: z.boolean().optional(), taskId: id }).strict(),
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
  if (name === 'get_current_time') {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    return { success: true, ...voiceClock(user.timeZone) };
  }
  const args = input as Record<string, string | number | boolean | null>;
  if (typeof args.scheduledAt === 'string' && +new Date(args.scheduledAt) <= Date.now()) throw new Error('Schedule must be in the future');
  if (['create_task', 'create_calendar_event'].includes(name) && args.allowScheduleConflict !== true) {
    const start = new Date(String(name === 'create_task' ? args.scheduledAt : args.startAt));
    const end = name === 'create_task' ? new Date(+start + Number(args.durationMin) * 60000) : new Date(String(args.endAt));
    const warnings = await checkCreationAvailability(userId, start, end, name === 'create_task' ? 'task' : 'event');
    if (warnings.length) return { success: false, requiresConfirmation: true, warnings, message: 'Explain these scheduling warnings and ask whether to create anyway. Nothing has been saved. Only after explicit agreement retry with allowScheduleConflict true.' };
  }
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
  if (name === 'find_free_time') {
    const from = new Date(String(args.from)), to = new Date(String(args.to));
    if (+to <= +from || +to - +from > 7 * 86400000) throw new Error('Use a window of at most seven days');
    const { loadScheduleContext } = await import('@/server/schedule-intelligence');
    const context = await loadScheduleContext(userId, new Date(+from - 86400000), 10, undefined, new Date());
    const slots = availability(context, from, to).slots.filter(slot => slot.end - slot.start >= Number(args.durationMin) * 60000);
    return { success: true, slots: slots.slice(0, 20).map(slot => ({ from: new Date(slot.start).toISOString(), to: new Date(slot.end).toISOString() })), warnings: context.contextWarnings, basedOn: 'Saved working hours, task durations, appointments and configured buffers', truncated: slots.length > 20 };
  }
  if (name === 'get_schedule') {
    const from = new Date(String(args.from)), to = new Date(String(args.to));
    if (+to <= +from || +to - +from > 7 * 86400000) throw new Error('Use a window of at most seven days');
    // Include tasks that began before the requested window but may still overlap it.
    const [tasks, events] = await Promise.all([
      prisma.task.findMany({ where: { userId, deletedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] }, startAt: { gte: new Date(+from - 86400000), lt: to } }, select: selection, take: 201 }),
      listEventsInRange(userId, from, to),
    ]);
    if (tasks.length > 200 || events.length > 200) return { success: false, error: 'Window too busy; request a smaller range.' };
    const overlapping = tasks.filter(t => t.startAt && +t.startAt + t.durationMin * 60000 > +from);
    return { success: true, tasks: overlapping, events: events.map(e => ({ title: e.title, startAt: e.startAt, endAt: e.endAt })) };
  }
  let task;
  if (name === 'create_task' || name === 'create_reminder') {
    const key = 'voice:' + createHash('sha256').update(`${userId}:${sessionId}:${callId}`).digest('hex');
    task = await createTask({ userId, title: String(args.title), notes: args.notes as string | undefined, startAt: new Date(String(args.scheduledAt)), durationMin: name === 'create_reminder' ? 5 : Number(args.durationMin), kind: name === 'create_reminder' ? 'REMINDER' : undefined, idempotencyKey: key });
  } else {
    const owned = await prisma.task.findFirst({ where: { id: String(args.taskId), userId, deletedAt: null } });
    if (!owned) return { success: false, error: 'Task not found. Ask the user which task.' };
    if (name === 'update_task' && (args.scheduledAt || args.durationMin !== undefined) && args.allowScheduleConflict !== true) {
      const start = args.scheduledAt ? new Date(String(args.scheduledAt)) : owned.startAt;
      if (start) {
        const warnings = await checkCreationAvailability(userId, start, new Date(+start + Number(args.durationMin ?? owned.durationMin) * 60000), 'task', owned.id);
        if (warnings.length) return { success: false, requiresConfirmation: true, warnings, message: 'No changes saved. Explain the warnings and ask before retrying with allowScheduleConflict true.' };
      }
    }
    if (name === 'complete_task') {
      try { task = owned.status === 'COMPLETED' ? owned : await completeTask(userId, owned.id, args.allowScheduleConflict === true); }
      catch (error) { if (error instanceof ScheduleWarning) return { success: false, requiresConfirmation: true, warnings: error.warnings, message: 'The next repeating occurrence has a conflict. Nothing changed. Ask before retrying with allowScheduleConflict true.' }; throw error; }
    }
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
