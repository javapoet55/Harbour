import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma';
import { createPasswordReset, registerAccount, resetPassword, validatePassword } from './account-auth';
import { login } from './auth';

const prisma = new PrismaClient();
const email = `native-auth-${Date.now()}@nexdo.test`;
let userId = '';

describe('native account authentication', () => {
  afterAll(async () => {
    if (userId) {
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
      await prisma.userPreference.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
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

  it('uses a one-time expiring code and updates only the intended account', async () => {
    const request = await createPasswordReset(email);
    expect(request.delivered).toBe(true);
    expect(request.developmentCode).toMatch(/^\d{6}$/);
    await expect(resetPassword({ email, code: '000000', password: 'replacement-password-123' })).rejects.toThrow('INVALID_RESET_CODE');
    await resetPassword({ email, code: request.developmentCode!, password: 'replacement-password-123' });
    await expect(resetPassword({ email, code: request.developmentCode!, password: 'other-password-123' })).rejects.toThrow('INVALID_RESET_CODE');
    expect(await login(email, 'initial-password-123')).toBeNull();
    expect(await login(email, 'replacement-password-123')).toMatchObject({ id: userId });
  });
});
