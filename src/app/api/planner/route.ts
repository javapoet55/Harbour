import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { buildDailyPlan } from '@/server/planner';
import { addDays, tzToday, ymd } from '@/lib/time';

export async function GET() {
  const user = await requireUser();
  const tomorrow = ymd(addDays(tzToday(user.timeZone), 1));
  const plan = await buildDailyPlan(user.id, user.timeZone, tomorrow);
  return NextResponse.json(plan);
}
