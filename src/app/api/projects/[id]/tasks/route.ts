import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { projectTasks } from '@/server/projects';
import { jsonError } from '@/lib/http';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(); const { id } = await context.params; return NextResponse.json({ tasks: await projectTasks(user.id, id), timeZone: user.timeZone }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return jsonError(error); }
}
