import { NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma';
import { requireUser } from '@/server/auth';
import { completeTask, deleteTask, scheduleTask, updateTask } from '@/server/tasks';
import { pushTaskToExternal } from '@/server/calendar-sync';
import { scheduleDefaultReminders } from '@/server/reminders';
import { jsonError } from '@/lib/http';
import { zonedDateTime } from '@/lib/time';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.status === 'COMPLETED') {
      return NextResponse.json({ task: await completeTask(user.id, id) });
    }
    if (body.status === 'CANCELLED') {
      return NextResponse.json({ task: await deleteTask(user.id, id) });
    }
    if (body.startAt || body.date) {
      const startAt = body.date
        ? zonedDateTime(String(body.date), String(body.time || '09:00'), user.timeZone)
        : new Date(body.startAt);
      const task = await scheduleTask(user.id, id, startAt, body.durationMin);
      await scheduleDefaultReminders(user.id, id, startAt, Boolean(task.critical));
      await pushTaskToExternal(user.id, id);
      return NextResponse.json({ task });
    }
    const data: Prisma.TaskUpdateInput = {};
    if (typeof body.title === 'string') data.title = body.title;
    if (typeof body.notes === 'string') data.notes = body.notes;
    if (typeof body.status === 'string') data.status = body.status;
    if (typeof body.priority === 'string') data.priority = body.priority;
    if (typeof body.waitingOn === 'string' || body.waitingOn === null) data.waitingOn = body.waitingOn;
    if (typeof body.durationMin === 'number') data.durationMin = body.durationMin;
    const task = await updateTask(user.id, id, data);
    return NextResponse.json({ task });
  } catch (err) {
    return jsonError(err);
  }
}
