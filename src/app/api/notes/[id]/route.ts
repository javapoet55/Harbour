import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { deleteNote, saveNote } from '@/server/notes';
import { jsonError } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };
async function healthHandlerPATCH(request: Request, context: Context) {
  try { const user = await requireUser(); const { id } = await context.params; return NextResponse.json({ note: await saveNote(user.id, id, await request.json().catch(() => null)) }); }
  catch (error) { return jsonError(error); }
}
async function healthHandlerDELETE(_request: Request, context: Context) {
  try { const user = await requireUser(); const { id } = await context.params; return NextResponse.json(await deleteNote(user.id, id)); }
  catch (error) { return jsonError(error); }
}

export const PATCH = healthRoute('PATCH /api/notes/[id]', healthHandlerPATCH);

export const DELETE = healthRoute('DELETE /api/notes/[id]', healthHandlerDELETE);
