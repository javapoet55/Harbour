import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { highPriority, snapshotForRange, unscheduledTasks, waitingTasks } from '@/server/agenda';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const days = Number(new URL(req.url).searchParams.get('days') ?? '3');
    const snap = await snapshotForRange(user.id, user.timeZone, Math.min(31, Math.max(1, days)));
    const [waiting, unscheduled, important] = await Promise.all([
      waitingTasks(user.id),
      unscheduledTasks(user.id),
      highPriority(user.id),
    ]);
    return NextResponse.json({
      timeZone: user.timeZone,
      range: { from: snap.range.from, to: snap.range.to, days: snap.range.days },
      tasks: snap.tasks,
      events: snap.events,
      overdue: snap.overdue,
      waiting,
      unscheduled,
      important,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    throw error;
  }
}
