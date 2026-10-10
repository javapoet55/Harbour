import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { loadPreparation, savePreparation } from './follow-up';
const owners: string[] = [];
async function owner() { const u = await prisma.user.create({ data: { name: 'Follow-up tester', email: `${randomUUID()}@followup.test`, passwordHash: 'unused' } }); owners.push(u.id); return u.id; }
afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: owners } } }); });
const preparation = { company: 'Insurance company', purpose: 'Claim status', phone: '', email: '', notes: 'Reference 123', draft: 'Please share the claim status.', checklist: [{ id: 'one', title: 'Have reference ready', done: true }], outcomes: [] };
it('persists preparation and outcomes, isolates owners and rejects stale updates', async () => {
 const userId = await owner(), other = await owner();
 const task = await prisma.task.create({ data: { userId, title: 'Follow up with insurance' } });
 expect(await loadPreparation(userId, task.id)).toEqual({ revision: 0, preparation: null });
 await expect(loadPreparation(other, task.id)).rejects.toThrow('NOT_FOUND');
 const first = await savePreparation(userId, task.id, { revision: 0, preparation });
 expect(first.revision).toBe(1);
 expect(await loadPreparation(userId, task.id)).toEqual(first);
 expect(await savePreparation(userId, task.id, { revision: 0, preparation })).toEqual(first);
 await expect(savePreparation(userId, task.id, { revision: 0, preparation: { ...preparation, notes: 'Stale edit' } })).rejects.toThrow('FOLLOW_UP_CHANGED');
 await expect(savePreparation(other, task.id, first)).rejects.toThrow('NOT_FOUND');
 const outcome = { id: randomUUID(), date: new Date().toISOString(), result: 'unresolved', notes: 'Waiting for adjuster' };
 const second = await savePreparation(userId, task.id, { revision: 1, preparation: { ...preparation, outcomes: [outcome] } });
 expect(second.preparation.outcomes).toEqual([outcome]);
 await prisma.task.update({ where: { id: task.id }, data: { status: 'COMPLETED' } });
 expect((await loadPreparation(userId, task.id)).preparation.outcomes).toHaveLength(1);
 await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
 await expect(loadPreparation(userId, task.id)).rejects.toThrow('NOT_FOUND');
});
it('rejects oversized preparation and invalid outcome data', async () => {
 const userId = await owner(); const task = await prisma.task.create({ data: { userId, title: 'Call insurance' } });
 await expect(savePreparation(userId, task.id, { revision: 0, preparation: { ...preparation, notes: 'x'.repeat(10001) } })).rejects.toThrow();
});
