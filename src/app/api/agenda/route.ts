import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { highPriority, snapshotForRange, unscheduledTasks, waitingTasks } from '@/server/agenda';

async function healthHandlerGET(req: Request) {
  try {
    const user = await requireUser();
    const params = new URL(req.url).searchParams;
    const days = Number(params.get('days') ?? '3');
    const from = params.get('from') ?? undefined;
    if (!Number.isInteger(days) || days < 1 || days > 42 || (from && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(Date.parse(from)) || new Date(from).toISOString().slice(0, 10) !== from))) {
      return NextResponse.json({ error: 'Provide a valid date and 1–42 days.' }, { status: 400 });
    }
    const snap = await snapshotForRange(user.id, user.timeZone, days, new Date(), from);
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

export const GET = healthRoute('GET /api/agenda', healthHandlerGET);
