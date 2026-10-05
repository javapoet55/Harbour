import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/session', () => ({ clearSession: vi.fn() }));
vi.mock('@/server/db', () => ({ prisma: { user: { updateMany: vi.fn() } } }));
vi.mock('@/server/account-auth', () => ({ validatePassword: (value: string) => { if (Buffer.byteLength(value) > 72) throw new Error('PASSWORD_POLICY'); } }));
import bcrypt from 'bcryptjs';
import { requireUser } from '@/server/auth';
import { clearSession } from '@/server/session';
import { prisma } from '@/server/db';
import { POST } from './route';
const oldPassword = 'old-password-123';
const newPassword = 'new-password-456';
const request = (body: unknown) => POST(new Request('http://localhost/api/auth/change-password', { method: 'POST', body: JSON.stringify(body) }));
beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: 'owner', passwordHash: await bcrypt.hash(oldPassword, 4) } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
});
describe('change password', () => {
  it('requires authentication', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error('UNAUTHENTICATED'));
    expect((await request({})).status).toBe(401);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    { currentPassword: 'wrong-password', newPassword, confirmPassword: newPassword },
    { currentPassword: oldPassword, newPassword, confirmPassword: 'different-password' },
    { currentPassword: oldPassword, newPassword: 'short', confirmPassword: 'short' },
    { currentPassword: oldPassword, newPassword: oldPassword, confirmPassword: oldPassword },
    { currentPassword: oldPassword, newPassword: '🔒'.repeat(20), confirmPassword: '🔒'.repeat(20) },
  ])('rejects invalid credentials without signing out', async body => {
    expect((await request(body)).status).toBe(400);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });
  it('hashes the new password and signs out after the update', async () => {
    expect((await request({ currentPassword: oldPassword, newPassword, confirmPassword: newPassword })).status).toBe(200);
    const input = vi.mocked(prisma.user.updateMany).mock.calls[0][0]!;
    expect(input.where).toMatchObject({ id: 'owner', deletedAt: null });
    const hash = input.data.passwordHash as string;
    expect(await bcrypt.compare(newPassword, hash)).toBe(true);
    expect(await bcrypt.compare(oldPassword, hash)).toBe(false);
    expect(clearSession).toHaveBeenCalledOnce();
  });
  it('does not overwrite a concurrent password change', async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
    expect((await request({ currentPassword: oldPassword, newPassword, confirmPassword: newPassword })).status).toBe(409);
    expect(clearSession).not.toHaveBeenCalled();
  });
  it('does not change a provider-only account or sign it out', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'owner', passwordHash: '' } as Awaited<ReturnType<typeof requireUser>>);
    expect((await request({ currentPassword: oldPassword, newPassword, confirmPassword: newPassword })).status).toBe(400);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });
  it('retains the session when saving fails', async () => {
    vi.mocked(prisma.user.updateMany).mockRejectedValue(new Error('Database unavailable'));
    expect((await request({ currentPassword: oldPassword, newPassword, confirmPassword: newPassword })).status).toBe(500);
    expect(clearSession).not.toHaveBeenCalled();
  });
});
