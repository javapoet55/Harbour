// POST /api/moments turns invalid input into a 400 with a readable message, like the other routes.
import { beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
import { POST } from '@/app/api/moments/route';

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.com`, name: 'Moments', passwordHash: '' } });
  mocks.requireUser.mockResolvedValue({ id: user.id });
});
const post = (body: unknown) => POST(new Request('http://localhost/api/moments', { method: 'POST', body: JSON.stringify(body) }));

it.each([
  ['no operation', {}],
  ['an invalid visibility change', { operation: 'visibility', input: { id: 'm1', enabled: 'yes' } }],
  ['invalid connect status ids', { operation: 'connectStatus', input: { momentIds: 'm1' } }],
])('answers 400 with a readable message for %s', async (_, body) => {
  const res = await post(body);
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'Check the moment details and try again.' });
});

it('still answers 400 "Invalid JSON request." for a body that is not JSON', async () => {
  const res = await POST(new Request('http://localhost/api/moments', { method: 'POST', body: '{' }));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'Invalid JSON request.' });
});
