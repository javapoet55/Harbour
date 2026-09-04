import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { createTask } from '@/server/tasks';
import { scheduleDefaultReminders } from '@/server/reminders';
import { prisma } from '@/server/db';
import { zonedDateTime } from '@/lib/time';

export async function GET() {
  const user = await requireUser();
  const tasks = await prisma.task.findMany({
    where: { userId: user.id, deletedAt: null },
    include: { subtasks: true, category: true, project: true },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json();
  const startAt = body.startAt
    ? new Date(body.startAt)
    : body.date
      ? zonedDateTime(body.date, body.time || '09:00', user.timeZone)
      : null;
  const task = await createTask({
    userId: user.id,
    title: String(body.title ?? '').trim(),
    notes: body.notes,
    priority: body.priority,
    status: body.status ?? 'PLANNED',
    startAt,
    dueAt: startAt,
    durationMin: body.durationMin,
    waitingOn: body.waitingOn,
    critical: Boolean(body.critical),
  });
  if (startAt) await scheduleDefaultReminders(user.id, task.id, startAt, Boolean(body.critical));
  return NextResponse.json({ task });
}
