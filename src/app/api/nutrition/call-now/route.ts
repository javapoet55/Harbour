import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { requestCallNow } from '@/server/nutrition/calls';
import { nutritionErrorResponse } from '@/server/nutrition/errors';

/** Places a check-in call right away (setup "Try it now"). Rate-limited per user. */
export async function POST() {
  try { const user = await requireUser(); return NextResponse.json(await requestCallNow(user.id), { status: 202 }); }
  catch (error) { return nutritionErrorResponse(error); }
}
