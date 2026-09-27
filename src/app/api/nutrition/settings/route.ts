import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { nutritionErrorResponse } from '@/server/nutrition/errors';
import { readSettings, updateSettings } from '@/server/nutrition/settings';

export async function GET() {
  try { const user = await requireUser(); return NextResponse.json(await readSettings(user.id, user.timeZone)); }
  catch (error) { return nutritionErrorResponse(error); }
}
export async function PUT(request: Request) {
  try { const user = await requireUser(); return NextResponse.json(await updateSettings(user.id, user.timeZone, await request.json())); }
  catch (error) { return nutritionErrorResponse(error); }
}
