import { requireAvailableSchedule } from '@/server/availability';
import { parseProjectId } from '@/server/projects';
import { jsonError } from '@/lib/http';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { createTask } from '@/server/tasks';
import { scheduleDefaultReminders } from '@/server/reminders';
import { prisma } from '@/server/db';
import { zonedDateTime } from '@/lib/time';
import { pushTaskToExternal } from '@/server/calendar-sync';
import { generateReplanProposal } from '@/server/replanner';
import { taskTimelineCondition } from '@/lib/task-timeline';

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
    const startAt = body.startAt
      ? new Date(body.startAt)
      : body.date
        ? zonedDateTime(body.date, body.time || '09:00', user.timeZone)
        : null;
    await requireAvailableSchedule(user.id, startAt, body.durationMin ?? 30, body.allowScheduleConflict);
    const task = await createTask({
      userId: user.id,
      projectId: body.projectId === undefined ? undefined : parseProjectId(body.projectId),
      title: String(body.title ?? '').trim(),
      notes: body.notes,
      priority: body.priority,
      status: body.status ?? 'PLANNED',
      startAt,
      dueAt: startAt,
      durationMin: body.durationMin,
      energyLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(body.energyLevel) ? body.energyLevel : undefined,
      waitingOn: body.waitingOn,
      critical: Boolean(body.critical),
    });
    if (body.recurrence?.frequency && ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(body.recurrence.frequency).toUpperCase())) {
      await prisma.recurrenceRule.create({ data: { taskId: task.id, frequency: String(body.recurrence.frequency).toUpperCase(), interval: Math.max(1, Number(body.recurrence.interval) || 1), byWeekday: Array.isArray(body.recurrence.byWeekday) ? body.recurrence.byWeekday.join(',') : null, until: body.recurrence.until ? new Date(body.recurrence.until) : null, count: body.recurrence.count ? Math.max(1, Number(body.recurrence.count)) : null } });
    }
    if (startAt) await scheduleDefaultReminders(user.id, task.id, startAt, Boolean(body.critical));
    if (startAt) await pushTaskToExternal(user.id, task.id);
    await generateReplanProposal(user.id);
    return NextResponse.json({ task });
  } catch (error) { return jsonError(error); }
}
