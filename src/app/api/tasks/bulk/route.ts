import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { completeTask, deleteTask } from '@/server/tasks';
import { generateReplanProposal } from '@/server/replanner';
import { jsonError } from '@/lib/http';

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const ids: string[] = [...new Set<string>((Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => String(id)))].slice(0, 100);
    if (!ids.length) return NextResponse.json({ error: 'Select at least one task.' }, { status: 400 });
    const owned = await prisma.task.count({ where: { userId: user.id, id: { in: ids }, deletedAt: null } });
    if (owned !== ids.length) return NextResponse.json({ error: 'One or more selected tasks are unavailable.' }, { status: 404 });

    if (body.status === 'COMPLETED') await Promise.all(ids.map((id) => completeTask(user.id, id)));
    else if (body.status === 'CANCELLED') await Promise.all(ids.map((id) => deleteTask(user.id, id)));
    else {
      const data: { status?: string; priority?: string; energyLevel?: string; projectId?: string | null } = {};
      if (['INBOX', 'PLANNED', 'IN_PROGRESS', 'WAITING'].includes(body.status)) data.status = body.status;
      if (['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(body.priority)) data.priority = body.priority;
      if (['LOW', 'MEDIUM', 'HIGH'].includes(body.energyLevel)) data.energyLevel = body.energyLevel;
      if (typeof body.projectId === 'string' || body.projectId === null) data.projectId = body.projectId;
      if (!Object.keys(data).length) return NextResponse.json({ error: 'Choose a supported bulk change.' }, { status: 400 });
      if (data.projectId && !await prisma.project.count({ where: { id: data.projectId, userId: user.id, deletedAt: null } })) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      await prisma.task.updateMany({ where: { userId: user.id, id: { in: ids }, deletedAt: null }, data });
    }
    await generateReplanProposal(user.id);
    return NextResponse.json({ updated: ids.length });
  } catch (error) {
    return jsonError(error);
  }
}
