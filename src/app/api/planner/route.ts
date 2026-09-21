import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { buildDailyPlan } from '@/server/planner';
import { addDays, tzToday, ymd } from '@/lib/time';

async function healthHandlerGET() {
  const user = await requireUser();
  const tomorrow = ymd(addDays(tzToday(user.timeZone), 1));
  const plan = await buildDailyPlan(user.id, user.timeZone, tomorrow);
  return NextResponse.json(plan);
}

export const GET = healthRoute('GET /api/planner', healthHandlerGET);
