import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { nutritionErrorResponse } from '@/server/nutrition/errors';
import { dailyInsight, handleInsight } from '@/server/nutrition/insights';
import { localDateIn } from '@/server/nutrition/time';

/** GET ?date= — today's insight (or null). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const date = new URL(request.url).searchParams.get('date') ?? localDateIn(user.timeZone);
    return NextResponse.json({ insight: await dailyInsight(user.id, date) });
  } catch (error) { return nutritionErrorResponse(error); }
}
/** POST { date?, key, action: 'add' | 'dismiss' } */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as { date?: unknown; key?: unknown; action?: unknown };
    const date = typeof body.date === 'string' ? body.date : localDateIn(user.timeZone);
    return NextResponse.json(await handleInsight(user.id, date, body.key, body.action));
  } catch (error) { return nutritionErrorResponse(error); }
}
