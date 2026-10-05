import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { nutritionErrorResponse } from '@/server/nutrition/errors';
import { addEntry, dayLog } from '@/server/nutrition/log';
import { localDateIn } from '@/server/nutrition/time';

/** GET ?date=YYYY-MM-DD (defaults to today in the user's time zone). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const date = new URL(request.url).searchParams.get('date') ?? localDateIn(user.timeZone);
    return NextResponse.json(await dayLog(user.id, date));
  } catch (error) { return nutritionErrorResponse(error); }
}
export async function POST(request: Request) {
  try { const user = await requireUser(); return NextResponse.json({ entry: await addEntry(user.id, await request.json()) }, { status: 201 }); }
  catch (error) { return nutritionErrorResponse(error); }
}
