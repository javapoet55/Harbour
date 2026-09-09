import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { buildWeeklySummary, startOfAccountWeek } from '@/server/weekly-summary';
import { jsonError } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const start = new URL(request.url).searchParams.get('start') ?? startOfAccountWeek(user.timeZone);
    return NextResponse.json(await buildWeeklySummary(user.id, user.timeZone, start), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof Error && ['INVALID_WEEK', 'FUTURE_WEEK'].includes(error.message)) {
      return NextResponse.json({ error: 'Choose a valid date in the current week or an earlier week.' }, { status: 400 });
    }
    return jsonError(error);
  }
}
