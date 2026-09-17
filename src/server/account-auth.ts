import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './db';
import { emailDeliveryMocked, emailProvider } from '@/providers';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const nameSchema = z.string().trim().min(1).max(100);

export const CODE_TTL_MINUTES = { verify: 24 * 60, reset: 15 } as const;
const MAX_CODE_ATTEMPTS = 5;
const SEND_WINDOW_MINUTES = 15;
const MAX_SENDS_PER_WINDOW = 3;

type CodePurpose = keyof typeof CODE_TTL_MINUTES;

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

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function codeExpiry(purpose: CodePurpose) {
  return new Date(Date.now() + CODE_TTL_MINUTES[purpose] * 60_000);
}

function codeLifetime(purpose: CodePurpose) {
  const minutes = CODE_TTL_MINUTES[purpose];
  return minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`;
}

type CodeDelivery = { delivered: boolean; developmentCode?: string };

function developmentCode(code: string): Pick<CodeDelivery, 'developmentCode'> {
  return process.env.NODE_ENV !== 'production' && emailDeliveryMocked() ? { developmentCode: code } : {};
}

function codeEmail(code: string, purpose: CodePurpose) {
  const heading = purpose === 'verify' ? 'Verify your email' : 'Reset your password';
  const intro = purpose === 'verify' ? 'Use this code to finish creating your Nexdo account.' : 'Use this code to reset your Nexdo password.';
  const ignore = purpose === 'verify'
    ? 'If you did not create a Nexdo account, you can ignore this email.'
    : 'If you did not request a password reset, you can ignore this email. Your password will not change.';
  return {
    subject: purpose === 'verify' ? 'Verify your Nexdo email' : 'Your Nexdo password reset code',
    text: `${intro}\n\nYour code is ${code}. It expires in ${codeLifetime(purpose)} and can be used once.\n\n${ignore}`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2933">`
      + `<h1 style="font-size:22px;margin:0 0 12px">${heading}</h1>`
      + `<p style="font-size:15px;line-height:1.6;margin:0 0 24px">${intro}</p>`
      + `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 24px;font-family:ui-monospace,Menlo,Consolas,monospace">${code}</p>`
      + `<p style="font-size:14px;line-height:1.6;color:#52606d;margin:0 0 8px">This code expires in ${codeLifetime(purpose)} and can be used once.</p>`
      + `<p style="font-size:14px;line-height:1.6;color:#52606d;margin:0">${ignore}</p>`
      + `</div>`,
  };
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

export async function sendEmailVerification(user: { id: string; email: string }): Promise<CodeDelivery> {
  const recent = await prisma.emailVerificationToken.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - SEND_WINDOW_MINUTES * 60_000) } },
  });
  if (recent >= MAX_SENDS_PER_WINDOW) return { delivered: true };

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.emailVerificationToken.create({ data: { userId: user.id, codeHash, expiresAt: codeExpiry('verify') } }),
  ]);

  const delivery = await emailProvider.send({ to: user.email, ...codeEmail(code, 'verify') });
  if (delivery.status === 'FAILED') throw new Error('EMAIL_UNAVAILABLE');
  return { delivered: true, ...developmentCode(code) };
}

export async function requestEmailVerification(emailValue: string): Promise<CodeDelivery> {
  const email = normalizeEmail(emailValue);
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user || user.emailVerifiedAt) {
    // Keep the response timing closer to the real-account path to reduce account enumeration signals.
    await bcrypt.hash('000000', 10);
    return { delivered: true };
  }
  return sendEmailVerification(user);
}

export async function verifyEmail(emailValue: string, code: string) {
  const email = normalizeEmail(emailValue);
  if (!/^\d{6}$/.test(code)) throw new Error('INVALID_VERIFICATION_CODE');
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) throw new Error('INVALID_VERIFICATION_CODE');
  const token = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token) throw new Error('INVALID_VERIFICATION_CODE');
  // Count the attempt before comparing so concurrent guesses cannot exceed the limit.
  const counted = await prisma.emailVerificationToken.updateMany({
    where: { id: token.id, attempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1 || !await bcrypt.compare(code, token.codeHash)) throw new Error('INVALID_VERIFICATION_CODE');
  const verifiedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: verifiedAt } });
    if (claimed.count !== 1) throw new Error('INVALID_VERIFICATION_CODE');
    await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt ?? verifiedAt } });
  });
  return user;
}

export async function createPasswordReset(emailValue: string): Promise<CodeDelivery> {
  const email = normalizeEmail(emailValue);
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) {
    // Keep the response timing closer to the real-account path to reduce account enumeration signals.
    await bcrypt.hash('000000', 10);
    return { delivered: true };
  }

  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - SEND_WINDOW_MINUTES * 60_000) } },
  });
  if (recent >= MAX_SENDS_PER_WINDOW) return { delivered: true };

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, codeHash, expiresAt: codeExpiry('reset') } }),
  ]);

  const delivery = await emailProvider.send({ to: user.email, ...codeEmail(code, 'reset') });
  if (delivery.status === 'FAILED') throw new Error('EMAIL_UNAVAILABLE');
  return { delivered: true, ...developmentCode(code) };
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
  if (!token) throw new Error('INVALID_RESET_CODE');
  // Count the attempt before comparing so concurrent guesses cannot exceed the limit.
  const counted = await prisma.passwordResetToken.updateMany({
    where: { id: token.id, attempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1 || !await bcrypt.compare(input.code, token.codeHash)) throw new Error('INVALID_RESET_CODE');
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new Error('INVALID_RESET_CODE');
    // A valid reset code proves control of the inbox, so it also verifies the email.
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
  });
}
