import { z } from 'zod';
import { prisma } from '@/server/db';

export const preparationSchema = z.object({
  company: z.string().trim().min(1).max(200), purpose: z.string().trim().min(1).max(2000),
  phone: z.string().max(100), email: z.string().max(320), notes: z.string().max(10000), draft: z.string().max(10000),
  checklist: z.array(z.object({ id: z.string().max(100), title: z.string().max(500), done: z.boolean() })).max(30),
  outcomes: z.array(z.object({ id: z.string().max(100), date: z.string().datetime(), result: z.enum(['resolved', 'unresolved', 'noAnswer']), notes: z.string().max(2000) })).max(100),
});
export const preparationInput = z.object({ revision: z.number().int().min(0), preparation: preparationSchema });
const key = (id: string) => `follow-up:${id}`;
async function owned(userId: string, taskId: string) {
  if (!await prisma.task.findFirst({ where: { id: taskId, userId, deletedAt: null }, select: { id: true } })) throw Error('NOT_FOUND');
}
export async function loadPreparation(userId: string, taskId: string) {
  await owned(userId, taskId);
  const row = await prisma.userMemory.findUnique({ where: { userId_key: { userId, key: key(taskId) } } });
  return row ? JSON.parse(row.value) : { revision: 0, preparation: null };
}
export async function savePreparation(userId: string, taskId: string, input: unknown) {
  const value = preparationInput.parse(input);
  return prisma.$transaction(async tx => {
    if (!await tx.task.findFirst({ where: { id: taskId, userId, deletedAt: null }, select: { id: true } })) throw Error('NOT_FOUND');
    const row = await tx.userMemory.findUnique({ where: { userId_key: { userId, key: key(taskId) } } });
    const revision = row ? JSON.parse(row.value).revision : 0;
    if (revision !== value.revision) {
      const current = row ? JSON.parse(row.value) : null;
      if (current && JSON.stringify(current.preparation) === JSON.stringify(value.preparation)) return current;
      throw Error('FOLLOW_UP_CHANGED');
    }
    const result = { revision: revision + 1, preparation: value.preparation };
    if (row) {
      const updated = await tx.userMemory.updateMany({ where: { id: row.id, userId, value: row.value }, data: { value: JSON.stringify(result) } });
      if (updated.count !== 1) throw Error('FOLLOW_UP_CHANGED');
    } else {
      await tx.userMemory.create({ data: { userId, key: key(taskId), kind: 'follow-up', source: 'task', value: JSON.stringify(result) } });
    }
    return result;
  });
}
