import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { nutritionErrorResponse } from '@/server/nutrition/errors';
import { deleteEntry, updateEntry } from '@/server/nutrition/log';

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try { const user = await requireUser(); const { id } = await context.params; return NextResponse.json({ entry: await updateEntry(user.id, id, await request.json()) }); }
  catch (error) { return nutritionErrorResponse(error); }
}
export async function DELETE(_request: Request, context: Context) {
  try { const user = await requireUser(); const { id } = await context.params; return NextResponse.json(await deleteEntry(user.id, id)); }
  catch (error) { return nutritionErrorResponse(error); }
}
