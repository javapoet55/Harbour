import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listProjects, saveProject } from '@/server/projects';
import { jsonError } from '@/lib/http';
export async function GET() {
  try { const user = await requireUser(); return NextResponse.json(await listProjects(user.id), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try { const user = await requireUser(); return NextResponse.json({ project: await saveProject(user.id, null, await request.json().catch(() => null)) }, { status: 201 }); }
  catch (error) { return jsonError(error); }
}
