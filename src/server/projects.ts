import type { Prisma } from '@/generated/prisma';
import { prisma } from './db';
import { z } from 'zod';

export const projectInput = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(value => value.toLowerCase()),
}).strict();
export function parseProjectId(value: unknown): string | null {
  const result = z.string().min(1).max(100).nullable().safeParse(value);
  if (!result.success) throw new Error('INVALID_PROJECT');
  return result.data;
}
export async function ownedProject(db: Prisma.TransactionClient, userId: string, id: string) {
  const project = await db.project.findFirst({ where: { id, userId, deletedAt: null } });
  if (!project) throw new Error('NOT_FOUND');
  return project;
}
export async function validateProjectAssignment(db: Prisma.TransactionClient, userId: string, id: string | null) {
  if (id !== null) await ownedProject(db, userId, id);
}
export const projectTaskScope = { deletedAt: null, status: { not: 'CANCELLED' } } as const;

export async function listProjects(userId: string) {
  const { projects, groups } = await prisma.$transaction(async tx => {
    const projects = await tx.project.findMany({ where: { userId, deletedAt: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, color: true, createdAt: true, updatedAt: true } });
    const groups = await tx.task.groupBy({ by: ['projectId', 'status'], where: { userId, ...projectTaskScope }, _count: { _all: true } });
    return { projects, groups };
  });
  const counts = new Map<string | null, { completedTaskCount: number; totalTaskCount: number }>();
  for (const group of groups) {
    const count = counts.get(group.projectId) ?? { completedTaskCount: 0, totalTaskCount: 0 };
    count.totalTaskCount += group._count._all;
    if (group.status === 'COMPLETED') count.completedTaskCount += group._count._all;
    counts.set(group.projectId, count);
  }
  return { projects: projects.map(project => ({ ...project, ...(counts.get(project.id) ?? { completedTaskCount: 0, totalTaskCount: 0 }) })), unassignedTaskCount: counts.get(null)?.totalTaskCount ?? 0 };
}
export async function saveProject(userId: string, id: string | null, body: unknown) {
  const parsed = projectInput.safeParse(body);
  if (!parsed.success) throw new Error('INVALID_PROJECT');
  return prisma.$transaction(async tx => {
    if (id) await ownedProject(tx, userId, id);
    const project = id ? await tx.project.update({ where: { id }, data: parsed.data }) : await tx.project.create({ data: { userId, ...parsed.data } });
    const [totalTaskCount, completedTaskCount] = await Promise.all([
      tx.task.count({ where: { userId, projectId: project.id, ...projectTaskScope } }),
      tx.task.count({ where: { userId, projectId: project.id, deletedAt: null, status: 'COMPLETED' } }),
    ]);
    return { id: project.id, name: project.name, color: project.color, createdAt: project.createdAt, updatedAt: project.updatedAt, totalTaskCount, completedTaskCount };
  });
}
export async function deleteProject(userId: string, id: string) {
  return prisma.$transaction(async tx => {
    await ownedProject(tx, userId, id);
    await tx.task.updateMany({ where: { userId, projectId: id }, data: { projectId: null } });
    await tx.project.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
export async function projectTasks(userId: string, id: string) {
  return prisma.$transaction(async tx => {
    await ownedProject(tx, userId, id);
    return tx.task.findMany({ where: { userId, projectId: id, ...projectTaskScope }, include: { subtasks: true, recurrence: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
  });
}
