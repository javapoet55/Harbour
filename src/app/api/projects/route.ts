import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listProjects, saveProject } from '@/server/projects';
import { jsonError } from '@/lib/http';
async function healthHandlerGET() {
  try { const user = await requireUser(); return NextResponse.json(await listProjects(user.id), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return jsonError(error); }
}
async function healthHandlerPOST(request: Request) {
  try { const user = await requireUser(); return NextResponse.json({ project: await saveProject(user.id, null, await request.json().catch(() => null)) }, { status: 201 }); }
  catch (error) { return jsonError(error); }
}

export const GET = healthRoute('GET /api/projects', healthHandlerGET);

export const POST = healthRoute('POST /api/projects', healthHandlerPOST);
