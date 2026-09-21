import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { shoppingAction, shoppingLists } from './service';
import { listInput } from './domain';
let owner = '';
beforeAll(async () => { owner = (await prisma.user.create({ data: { email: `${randomUUID()}@example.test`, name: 'Shopping UAT', passwordHash: '' } })).id; });
afterAll(async () => { await prisma.user.delete({ where: { id: owner } }); });
const item = (name: string) => ({ id: randomUUID(), name, category: 'Dairy & Eggs', quantity: '2', size: '1 gallon', notes: '', checked: false });
const input = () => ({ title: 'Tester flow', date: '2030-09-21', timeZone: 'America/Los_Angeles', weekly: false, items: [item('Milk'), item('Eggs')] });
it('persists edits, checking, a targeted replacement, deletion and completion across fresh reads', async () => {
 const result = await shoppingAction(owner, { operation: 'create', input: input() });
 if (!('list' in result) || !result.list) throw Error('Missing list');
 const id = result.list.id;
 let list = (await shoppingLists(owner)).find(l => l.id === id)!;
 const first = { ...list.items[0], name: 'Oat milk', quantity: '3', checked: true };
 await shoppingAction(owner, { operation: 'save', id, revision: list.revision, input: { ...input(), items: [first, list.items[1]] } });
 list = (await shoppingLists(owner)).find(l => l.id === id)!;
 expect(list.items[0]).toMatchObject({ name: 'Oat milk', quantity: '3', checked: true });
 expect(list.items[1]).toMatchObject({ name: 'Eggs', quantity: '2', checked: false });
 await shoppingAction(owner, { operation: 'save', id, revision: list.revision, input: { ...input(), items: [list.items[0]] } });
 list = (await shoppingLists(owner)).find(l => l.id === id)!;
 expect(list.items).toHaveLength(1);
 await shoppingAction(owner, { operation: 'complete', id, revision: list.revision });
 list = (await shoppingLists(owner)).find(l => l.id === id)!;
 expect(list.completedAt).not.toBeNull();
 expect(list.items[0].name).toBe('Oat milk');
});
it('repeated sharing reuses the link without duplicating lists or items', async () => {
 const result = await shoppingAction(owner, { operation: 'create', input: input() });
 if (!('list' in result) || !result.list) throw Error('Missing list');
 const id = result.list.id;
 const a = await shoppingAction(owner, { operation: 'share', id });
 const b = await shoppingAction(owner, { operation: 'share', id });
 if (!('list' in a) || !a.list || !('list' in b) || !b.list) throw Error('Missing list');
 expect(b.list.shareToken).toBe(a.list.shareToken);
 expect(b.list.items).toEqual(a.list.items);
 expect(await prisma.shoppingItem.count({ where: { listId: id } })).toBe(2);
});
it('rejects empty names and duplicate IDs without modifying saved data', async () => {
 const result = await shoppingAction(owner, { operation: 'create', input: input() });
 if (!('list' in result) || !result.list) throw Error('Missing list');
 const { id, revision } = result.list;
 const duplicate = item('Milk');
 for (const items of [[item(' ')], [duplicate, duplicate]]) {
  await expect(shoppingAction(owner, { operation: 'save', id, revision, input: { ...input(), items } })).rejects.toThrow();
 }
 const list = (await shoppingLists(owner)).find(l => l.id === id)!;
 expect(list.revision).toBe(revision);
 expect(list.items.map(i => i.name)).toEqual(['Milk', 'Eggs']);
});
it.fails.each(['', '-2', '0', 'abc'])('rejects invalid quantity %j (known UAT defect)', (quantity) => {
 expect(listInput.safeParse({ ...input(), items: [{ ...item('Milk'), quantity }] }).success).toBe(false);
});
