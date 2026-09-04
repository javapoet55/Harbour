import { NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma';
import { requireUser } from '@/server/auth';
import { completeTask, deleteTask, scheduleTask, startTask, updateTask } from '@/server/tasks';
import { pushTaskToExternal } from '@/server/calendar-sync';
import { scheduleDefaultReminders } from '@/server/reminders';
import { jsonError } from '@/lib/http';
import { zonedDateTime } from '@/lib/time';
import { generateReplanProposal } from '@/server/replanner';
import { prisma } from '@/server/db';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.status === 'COMPLETED') {
      const task = await completeTask(user.id, id);
      await pushTaskToExternal(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    if (body.status === 'CANCELLED') {
      const task = await deleteTask(user.id, id);
      await pushTaskToExternal(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    if (body.status === 'IN_PROGRESS') {
      const task = await startTask(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    if (body.startAt || body.date) {
      const startAt = body.date
        ? zonedDateTime(String(body.date), String(body.time || '09:00'), user.timeZone)
        : new Date(body.startAt);
      const task = await scheduleTask(user.id, id, startAt, body.durationMin);
      await scheduleDefaultReminders(user.id, id, startAt, Boolean(task.critical));
      await pushTaskToExternal(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    const data: Prisma.TaskUpdateInput = {};
    if (typeof body.title === 'string') data.title = body.title;
    if (typeof body.notes === 'string') data.notes = body.notes;
    if (typeof body.status === 'string') data.status = body.status;
    if (typeof body.priority === 'string') data.priority = body.priority;
    if (typeof body.waitingOn === 'string' || body.waitingOn === null) data.waitingOn = body.waitingOn;
    if (typeof body.durationMin === 'number') data.durationMin = body.durationMin;
    if (['LOW', 'MEDIUM', 'HIGH'].includes(body.energyLevel)) data.energyLevel = body.energyLevel;
    const task = await updateTask(user.id, id, data);
    if (body.recurrence === null) await prisma.recurrenceRule.deleteMany({ where: { taskId: id, task: { userId: user.id } } });
    else if (body.recurrence?.frequency && ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(body.recurrence.frequency).toUpperCase())) {
      const recurrence = { frequency: String(body.recurrence.frequency).toUpperCase(), interval: Math.max(1, Number(body.recurrence.interval) || 1), byWeekday: Array.isArray(body.recurrence.byWeekday) ? body.recurrence.byWeekday.join(',') : null, until: body.recurrence.until ? new Date(body.recurrence.until) : null, count: body.recurrence.count ? Math.max(1, Number(body.recurrence.count)) : null };
      await prisma.recurrenceRule.upsert({ where: { taskId: id }, update: recurrence, create: { taskId: id, ...recurrence } });
    }
    if (task.startAt) await pushTaskToExternal(user.id, id);
    await generateReplanProposal(user.id);
    return NextResponse.json({ task });
  } catch (err) {
    return jsonError(err);
  }
}
