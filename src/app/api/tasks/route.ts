import { requireAvailableSchedule } from '@/server/availability';
import { parseProjectId } from '@/server/projects';
import { jsonError } from '@/lib/http';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { createTask } from '@/server/tasks';
import { scheduleDefaultReminders, scheduleRequestedReminder } from '@/server/reminders';
import { prisma } from '@/server/db';
import { zonedDateTime } from '@/lib/time';
import { pushTaskToExternal } from '@/server/calendar-sync';
import { generateReplanProposal } from '@/server/replanner';
import { taskTimelineCondition } from '@/lib/task-timeline';
import { parseLifeReminder } from '@/lib/life-reminders';
import { inc } from '@/lib/metrics';

export async function GET(req: Request) {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const query = params.get('q')?.trim().slice(0, 100);
  const status = params.get('status');
  const priority = params.get('priority');
  const energy = params.get('energy');
  const due = params.get('due');
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
  const tasks = await prisma.task.findMany({
    where: {
      userId: user.id, deletedAt: null,
      AND: [taskTimelineCondition(params.get('timeline'), user.timeZone, now)],
      ...(query ? { OR: [{ title: { contains: query } }, { notes: { contains: query } }, { waitingOn: { contains: query } }, { project: { name: { contains: query } } }] } : {}),
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(priority && priority !== 'ALL' ? { priority } : {}),
      ...(energy && energy !== 'ALL' ? { energyLevel: energy } : {}),
      ...(due === 'OVERDUE' ? { dueAt: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED'] } } : due === 'NEXT_24_HOURS' ? { dueAt: { gte: now, lte: tomorrow } } : due === 'UNSCHEDULED' ? { startAt: null } : {}),
    },
    include: { subtasks: true, category: true, project: true, recurrence: true, tags: { include: { tag: true } } },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
  });
  return NextResponse.json({ tasks, timeZone: user.timeZone });
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const originalTitle = String(body.title ?? '').trim();
    const intent = parseLifeReminder(originalTitle, user.timeZone);
    const suppliedStartAt = body.startAt
      ? new Date(body.startAt)
      : body.date
        ? zonedDateTime(body.date, body.time || '09:00', user.timeZone)
        : null;
    const startAt = intent.recognized && intent.reminderDate ? intent.reminderDate : suppliedStartAt;
    const dueAt = intent.recognized ? intent.dueDate ?? startAt : startAt;
    if (!intent.recognized) await requireAvailableSchedule(user.id, startAt, body.durationMin ?? 30, body.allowScheduleConflict);
    const task = await createTask({
      userId: user.id,
      projectId: body.projectId === undefined ? undefined : parseProjectId(body.projectId),
      title: intent.recognized ? intent.title : originalTitle,
      notes: body.notes,
      priority: body.priority,
      status: body.status ?? 'PLANNED',
      startAt,
      dueAt,
      reminderAt: intent.recognized ? intent.reminderDate : null,
      lifeReminderType: intent.recognized ? intent.reminderType : null,
      lifeReminderConfidence: intent.recognized ? intent.confidence : null,
      originalUserText: intent.recognized ? intent.originalUserText : null,
      durationMin: intent.recognized ? 5 : body.durationMin,
      energyLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(body.energyLevel) ? body.energyLevel : undefined,
      waitingOn: body.waitingOn,
      critical: Boolean(body.critical),
    });
    const recurrence = intent.recognized ? intent.recurrenceRule : body.recurrence;
    if (recurrence?.frequency && ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(recurrence.frequency).toUpperCase())) {
      await prisma.recurrenceRule.create({ data: { taskId: task.id, frequency: String(recurrence.frequency).toUpperCase(), interval: Math.max(1, Number(recurrence.interval) || 1), byWeekday: Array.isArray(recurrence.byWeekday) ? recurrence.byWeekday.join(',') : null, until: recurrence.until ? new Date(recurrence.until) : null, count: recurrence.count ? Math.max(1, Number(recurrence.count)) : null } });
    }
    if (intent.recognized && intent.reminderDate) await scheduleRequestedReminder(user.id, task.id, intent.reminderDate, Boolean(body.critical));
    else if (startAt) await scheduleDefaultReminders(user.id, task.id, startAt, Boolean(body.critical));
    if (startAt && !intent.recognized) await pushTaskToExternal(user.id, task.id);
    if (intent.recognized) {
      inc('life_reminder_created');
      if (intent.recurrenceRule) inc('life_reminder_recurring_created');
    }
    await generateReplanProposal(user.id);
    return NextResponse.json({ task });
  } catch (error) { return jsonError(error); }
}
