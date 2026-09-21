import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { jsonError } from '@/lib/http';

async function healthHandlerGET() {
  try {
    const user = await requireUser();
    const [tasks, projects, preference] = await Promise.all([
      prisma.task.findMany({ where: { userId: user.id, deletedAt: null }, include: { subtasks: true, recurrence: true, tags: { include: { tag: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.project.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      prisma.userPreference.findUnique({ where: { userId: user.id } }),
    ]);
    return NextResponse.json({ exportedAt: new Date().toISOString(), profile: { name: user.name, email: user.email, timeZone: user.timeZone }, preference, projects, tasks });
  } catch (error) { return jsonError(error); }
}

export const GET = healthRoute('GET /api/export', healthHandlerGET);
