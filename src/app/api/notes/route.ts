import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listNotes, saveNote } from '@/server/notes';
import { jsonError } from '@/lib/http';

async function healthHandlerGET() {
  try { const user = await requireUser(); return NextResponse.json(await listNotes(user.id), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return jsonError(error); }
}
async function healthHandlerPOST(request: Request) {
  try { const user = await requireUser(); return NextResponse.json({ note: await saveNote(user.id, null, await request.json().catch(() => null)) }, { status: 201 }); }
  catch (error) { return jsonError(error); }
}

export const GET = healthRoute('GET /api/notes', healthHandlerGET);

export const POST = healthRoute('POST /api/notes', healthHandlerPOST);
