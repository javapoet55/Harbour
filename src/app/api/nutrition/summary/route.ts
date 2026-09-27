import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { nutritionErrorResponse } from '@/server/nutrition/errors';
import { periodSummary } from '@/server/nutrition/log';
import { localDateIn } from '@/server/nutrition/time';

/** GET ?period=week|month&date=YYYY-MM-DD — daily calorie totals ending on date. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const days = params.get('period') === 'month' ? 30 : 7;
    return NextResponse.json(await periodSummary(user.id, params.get('date') ?? localDateIn(user.timeZone), days));
  } catch (error) { return nutritionErrorResponse(error); }
}
