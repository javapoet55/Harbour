import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@/generated/prisma';
import { CODE_TTL_MINUTES, createPasswordReset, registerAccount, requestEmailVerification, resetPassword, sendEmailVerification, validatePassword, verifyEmail } from './account-auth';
import { login } from './auth';

const prisma = new PrismaClient();
const email = `native-auth-${Date.now()}@nexdo.test`;
let userId = '';
const createdIds: string[] = [];
const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

function expectCodeLifetime(expiresAt: Date, minutes: number) {
  expect(Math.abs(expiresAt.getTime() - (Date.now() + minutes * 60_000))).toBeLessThan(10_000);
}

describe('native account authentication', () => {
  beforeAll(() => {
    // Never send real email from tests, even when a SendGrid key is present in .env.
    vi.stubEnv('SENDGRID_API_KEY', '');
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    const ids = [userId, ...createdIds].filter(Boolean);
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('enforces the password policy', () => {
    expect(() => validatePassword('short')).toThrow('PASSWORD_POLICY');
    expect(validatePassword('correct horse battery staple')).toBe('correct horse battery staple');
  });

  it('creates a database-backed account and prevents duplicates', async () => {
    const user = await registerAccount({ name: 'Native User', email: `  ${email.toUpperCase()} `, password: 'initial-password-123' });
    userId = user.id;
    expect(user.email).toBe(email);
    expect(await login(email, 'initial-password-123')).toMatchObject({ id: user.id });
    await expect(registerAccount({ name: 'Duplicate', email, password: 'another-password-123' })).rejects.toThrow('ACCOUNT_EXISTS');
  });

  it('uses a one-time 15-minute reset code and updates only the intended account', async () => {
    const request = await createPasswordReset(email);
    expect(request.delivered).toBe(true);
    expect(request.developmentCode).toMatch(/^\d{6}$/);
    const token = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId, usedAt: null } });
    expectCodeLifetime(token.expiresAt, CODE_TTL_MINUTES.reset);
    await expect(resetPassword({ email, code: wrongCode(request.developmentCode!), password: 'replacement-password-123' })).rejects.toThrow('INVALID_RESET_CODE');
    await resetPassword({ email, code: request.developmentCode!, password: 'replacement-password-123' });
    await expect(resetPassword({ email, code: request.developmentCode!, password: 'other-password-123' })).rejects.toThrow('INVALID_RESET_CODE');
    expect(await login(email, 'initial-password-123')).toBeNull();
    expect(await login(email, 'replacement-password-123')).toMatchObject({ id: userId });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('locks a password reset code after five wrong attempts', async () => {
    const resetEmail = `native-reset-lock-${Date.now()}@nexdo.test`;
    const user = await registerAccount({ name: 'Reset Lock User', email: resetEmail, password: 'original-password-123' });
    createdIds.push(user.id);
    const { developmentCode } = await createPasswordReset(resetEmail);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(resetPassword({ email: resetEmail, code: wrongCode(developmentCode!), password: 'hijacked-password-123' })).rejects.toThrow('INVALID_RESET_CODE');
    }
    await expect(resetPassword({ email: resetEmail, code: developmentCode!, password: 'hijacked-password-123' })).rejects.toThrow('INVALID_RESET_CODE');
    expect(await login(resetEmail, 'hijacked-password-123')).toBeNull();
    expect(await login(resetEmail, 'original-password-123')).toMatchObject({ id: user.id });
  });

  it('verifies a new account with a 24-hour one-time code and invalidates older codes', async () => {
    const user = await registerAccount({ name: 'Verify User', email: `native-verify-${Date.now()}@nexdo.test`, password: 'verify-password-123' });
    createdIds.push(user.id);
    expect(user.emailVerifiedAt).toBeNull();

    const first = await sendEmailVerification(user);
    expect(first.developmentCode).toMatch(/^\d{6}$/);
    const token = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id, usedAt: null } });
    expectCodeLifetime(token.expiresAt, CODE_TTL_MINUTES.verify);

    const second = await requestEmailVerification(user.email);
    expect(second.developmentCode).toMatch(/^\d{6}$/);
    if (first.developmentCode !== second.developmentCode) {
      await expect(verifyEmail(user.email, first.developmentCode!)).rejects.toThrow('INVALID_VERIFICATION_CODE');
    }

    await verifyEmail(user.email, second.developmentCode!);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeInstanceOf(Date);
    await expect(verifyEmail(user.email, second.developmentCode!)).rejects.toThrow('INVALID_VERIFICATION_CODE');
    expect(await requestEmailVerification(user.email)).toEqual({ delivered: true });
  });

  it('locks a verification code after five wrong attempts until a new code is sent', async () => {
    const user = await registerAccount({ name: 'Locked User', email: `native-locked-${Date.now()}@nexdo.test`, password: 'locked-password-123' });
    createdIds.push(user.id);
    const { developmentCode } = await sendEmailVerification(user);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(verifyEmail(user.email, wrongCode(developmentCode!))).rejects.toThrow('INVALID_VERIFICATION_CODE');
    }
    await expect(verifyEmail(user.email, developmentCode!)).rejects.toThrow('INVALID_VERIFICATION_CODE');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();

    const replacement = await requestEmailVerification(user.email);
    await verifyEmail(user.email, replacement.developmentCode!);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('does not reveal whether an account exists when resending a code', async () => {
    expect(await requestEmailVerification(`missing-${Date.now()}@nexdo.test`)).toEqual({ delivered: true });
  });
});
