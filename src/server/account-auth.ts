import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './db';
import { emailProvider } from '@/providers';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const nameSchema = z.string().trim().min(1).max(100);

export function validatePassword(value: string) {
  if (value.length < 12 || Buffer.byteLength(value, 'utf8') > 72) {
    throw new Error('PASSWORD_POLICY');
  }
  return value;
}

export function normalizeEmail(value: string) {
  const result = emailSchema.safeParse(value);
  if (!result.success) throw new Error('INVALID_ACCOUNT_INPUT');
  return result.data;
}

export async function registerAccount(input: { name: string; email: string; password: string }) {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) throw new Error('INVALID_ACCOUNT_INPUT');
  const email = normalizeEmail(input.email);
  const password = validatePassword(input.password);
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    return await prisma.user.create({
      data: { name: name.data, email, passwordHash, preference: { create: {} } },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && String(error.code) === 'P2002') throw new Error('ACCOUNT_EXISTS');
    throw error;
  }
}

export async function verifyEmail(emailValue: string, code: string) {
  const email = normalizeEmail(emailValue);
  if (!/^\d{6}$/.test(code)) throw new Error('INVALID_VERIFICATION_CODE');
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) throw new Error('INVALID_VERIFICATION_CODE');
  const token = await prisma.emailVerificationToken.findFirst({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!token || !await bcrypt.compare(code, token.codeHash)) throw new Error('INVALID_VERIFICATION_CODE');
  await prisma.$transaction([prisma.emailVerificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }), prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })]);
}

export async function createPasswordReset(emailValue: string) {
  const email = normalizeEmail(emailValue);
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) {
    // Keep the response timing closer to the real-account path to reduce account enumeration signals.
    await bcrypt.hash('000000', 10);
    return { delivered: true };
  }

  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
  });
  if (recent >= 3) return { delivered: true };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, codeHash, expiresAt: new Date(Date.now() + 15 * 60_000) } }),
  ]);

  const delivery = await emailProvider.send({
    to: user.email,
    subject: 'Your Nexdo password reset code',
    text: `Your Nexdo verification code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
  });
  if (delivery.status === 'FAILED') throw new Error('EMAIL_UNAVAILABLE');
  return { delivered: true, ...(process.env.NODE_ENV === 'production' ? {} : { developmentCode: code }) };
}

export async function resetPassword(input: { email: string; code: string; password: string }) {
  const email = normalizeEmail(input.email);
  const password = validatePassword(input.password);
  if (!/^\d{6}$/.test(input.code)) throw new Error('INVALID_RESET_CODE');
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) throw new Error('INVALID_RESET_CODE');
  const token = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token || token.attempts >= 5) throw new Error('INVALID_RESET_CODE');
  const valid = await bcrypt.compare(input.code, token.codeHash);
  if (!valid) {
    await prisma.passwordResetToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    throw new Error('INVALID_RESET_CODE');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new Error('INVALID_RESET_CODE');
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
  });
}
