import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const mocks = vi.hoisted(() => ({ readUserId: vi.fn(), clearSession: vi.fn(), revokeEmail: vi.fn(), revokeAppleIdentity: vi.fn() }));
vi.mock('@/server/session', () => ({ readUserId: mocks.readUserId, clearSession: mocks.clearSession }));
vi.mock('@/server/moments/email', () => ({ revokeEmail: mocks.revokeEmail }));
vi.mock('@/server/apple-auth', () => ({ revokeAppleIdentity: mocks.revokeAppleIdentity }));
import { prisma } from '@/server/db';
import { DELETE } from './route';
import { currentUser } from '@/server/auth';
const ids: string[] = [];
async function user() {
  const u = await prisma.user.create({ data: { email: `${randomUUID()}@deletion.test`, name: 'Test', passwordHash: 'test', emailVerifiedAt: new Date() } });
  ids.push(u.id); return u;
}
beforeEach(() => { vi.resetAllMocks(); mocks.revokeEmail.mockResolvedValue(undefined); mocks.revokeAppleIdentity.mockResolvedValue(undefined); });
afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: ids } } }); });
it('rejects unauthenticated deletion without revoking credentials', async () => {
  mocks.readUserId.mockResolvedValue(null);
  expect((await DELETE()).status).toBe(401);
  expect(mocks.revokeEmail).not.toHaveBeenCalled();
});
it('deletes owned data and credentials, clears the session, and rejects an old session', async () => {
  const owner = await user(), other = await user();
  mocks.readUserId.mockResolvedValue(owner.id);
  const task = await prisma.task.create({ data: { userId: owner.id, title: 'Delete me' } });
  await prisma.reminder.create({ data: { userId: owner.id, taskId: task.id, fireAt: new Date(), offsetLabel: 'due', idempotencyKey: randomUUID() } });
  await prisma.emailVerificationToken.create({ data: { userId: owner.id, codeHash: 'test', expiresAt: new Date() } });
  await prisma.calendarConnection.create({ data: { userId: owner.id, provider: 'google', calendarId: 'test', accountEmail: owner.email, calendarName: 'Test', refreshToken: 'encrypted-fixture' } });
  await prisma.feedback.create({ data: { id: randomUUID(), userId: owner.id, customerName: 'Test', title: 'Bug', description: 'Fixture', stars: 0 } });
  const response = await DELETE();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  for (const table of [prisma.task, prisma.reminder, prisma.calendarConnection, prisma.emailVerificationToken, prisma.feedback] as any[]) expect(await table.count({ where: { userId: owner.id } })).toBe(0);
  expect(await prisma.user.findUnique({ where: { id: other.id } })).not.toBeNull();
  expect(mocks.clearSession).toHaveBeenCalledOnce();
  expect(await currentUser()).toBeNull();
  expect((await DELETE()).status).toBe(401);
});
it('preserves the account and session when external revocation fails so deletion can be retried', async () => {
  const owner = await user(); mocks.readUserId.mockResolvedValue(owner.id);
  mocks.revokeEmail.mockRejectedValueOnce(new Error('revocation failed'));
  expect((await DELETE()).status).toBeGreaterThanOrEqual(400);
  expect(await currentUser()).not.toBeNull();
  expect(mocks.clearSession).not.toHaveBeenCalled();
  expect((await DELETE()).status).toBe(200);
});

it('revokes Apple credentials before deleting an Apple account and preserves it on failure', async () => {
  const owner = await user(); mocks.readUserId.mockResolvedValue(owner.id);
  await prisma.authIdentity.create({ data: { userId: owner.id, provider: 'apple', subject: randomUUID(), refreshToken: 'encrypted-apple-fixture' } });
  mocks.revokeAppleIdentity.mockRejectedValueOnce(new Error('APPLE_REVOCATION_FAILED'));
  expect((await DELETE()).status).toBeGreaterThanOrEqual(400);
  expect(await currentUser()).not.toBeNull();
  expect(mocks.clearSession).not.toHaveBeenCalled();
  expect((await DELETE()).status).toBe(200);
  expect(mocks.revokeAppleIdentity).toHaveBeenCalledWith('encrypted-apple-fixture');
  expect(await prisma.authIdentity.count({ where: { userId: owner.id } })).toBe(0);
});
it('blocks deletion while a wish is sending, then permits retry after it finishes', async () => {
  const owner = await user(); mocks.readUserId.mockResolvedValue(owner.id);
  const moment = await prisma.importantMoment.create({ data: { userId: owner.id, type: 'birthday', title: 'Test', occurrenceDate: '2026-10-10', timeZoneID: 'UTC', sourceKey: randomUUID() } });
  const draft = await prisma.wishDraft.create({ data: { momentID: moment.id, body: 'Fixture' } });
  const plan = await prisma.deliveryPlan.create({ data: { draftID: draft.id, channel: 'email', recipient: 'test@example.com', subject: 'Fixture', body: 'Fixture', scheduledAtUTC: new Date(), timeZoneID: 'UTC', idempotencyKey: randomUUID(), nextAttemptAt: new Date(), approvedAt: new Date(), status: 'SENDING' } });
  expect((await DELETE()).status).toBe(409);
  expect(mocks.revokeEmail).not.toHaveBeenCalled();
  expect(mocks.clearSession).not.toHaveBeenCalled();
  await prisma.deliveryPlan.update({ where: { id: plan.id }, data: { status: 'SENT' } });
  expect((await DELETE()).status).toBe(200);
  expect(await prisma.deliveryPlan.findUnique({ where: { id: plan.id } })).toBeNull();
});
