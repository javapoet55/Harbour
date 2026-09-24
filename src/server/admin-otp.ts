import bcrypt from 'bcryptjs';
import { login } from './auth';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { prisma } from './db';
import { normalizeEmail } from './account-auth';
import { isAdminEmail } from './admin-allowlist';
import { adminEmailConfigured, adminEmailProvider } from '@/providers/admin-email';
import { adminSignInMessage } from './email/messages';
import { log } from '@/lib/logger';

export const ADMIN_CODE_TTL_MINUTES = 10;
export const ADMIN_CODE_MAX_ATTEMPTS = 5;
const ADMIN_SESSION_HOURS = 8;
const PASSWORD_ATTEMPT = 'password-attempt';

export const adminTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const opaqueToken = () => randomBytes(32).toString('hex');
// Compared against when no code exists, so verify takes the same bcrypt time either way.
let placeholderHash: Promise<string> | undefined;
const unusableHash = () => (placeholderHash ??= bcrypt.hash(opaqueToken(), 10));

/**
 * Creates a six-digit code for an allowlisted, existing account and starts emailing it. Codes are stored
 * only as bcrypt hashes, expire after ten minutes, and a new request invalidates every older unused code.
 * Unknown and unauthorized addresses get the same result and nothing is sent. Request rate limits live in
 * the API layer, keyed by email and IP for every address, so they cannot reveal who is an admin.
 * `delivery` resolves to whether the email was accepted and never rejects.
 */
export async function requestAdminCode(value: string): Promise<{ id: string; delivery: Promise<boolean> }> {
  const email = normalizeEmail(value);
  const id = opaqueToken();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const user = isAdminEmail(email) ? await prisma.user.findFirst({ where: { email, deletedAt: null } }) : null;
  if (!user) return { id, delivery: Promise.resolve(false) };
  // Never issue a code that cannot be delivered, and never let a mock delivery grant access.
  if (!adminEmailConfigured()) {
    log('warn', 'admin_otp.email_not_configured');
    return { id, delivery: Promise.resolve(false) };
  }
  await prisma.$transaction(async (tx) => {
    // Serialize requests for this account across instances, including concurrent resends.
    await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
    await tx.adminLoginToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await tx.adminLoginToken.create({ data: { id, userId: user.id, codeHash, expiresAt: new Date(Date.now() + ADMIN_CODE_TTL_MINUTES * 60_000) } });
  });
  return { id, delivery: deliverAdminCode(id, email, code) };
}

async function deliverAdminCode(id: string, email: string, code: string) {
  try {
    const result = await adminEmailProvider.send({ to: email, ...adminSignInMessage(code, `${ADMIN_CODE_TTL_MINUTES} minutes`) });
    if (result.status === 'SENT') return true;
    // Provider reasons never include the recipient or the message.
    log('warn', 'admin_otp.delivery_failed', { reason: result.reason ?? 'unknown' });
  } catch {
    log('warn', 'admin_otp.delivery_failed', { reason: 'exception' });
  }
  // An undelivered code must not stay redeemable.
  await prisma.adminLoginToken.update({ where: { id }, data: { usedAt: new Date() } }).catch(() => undefined);
  return false;
}

/** Redeems a code by its challenge id. At most five tries per code; single use; creates an 8-hour session. */
export async function verifyAdminCode(id: string, code: string) {
  const invalid = () => new Error('INVALID_ADMIN_CODE');
  if (!/^[a-f0-9]{64}$/.test(id) || !/^\d{6}$/.test(code)) throw invalid();
  const token = await prisma.adminLoginToken.findUnique({ where: { id }, include: { user: true } });
  if (!token || token.usedAt || token.codeHash === PASSWORD_ATTEMPT || token.expiresAt <= new Date() || token.user.deletedAt || !isAdminEmail(token.user.email)) throw invalid();
  const counted = await prisma.adminLoginToken.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: ADMIN_CODE_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1 || !await bcrypt.compare(code, token.codeHash)) throw invalid();
  const session = opaqueToken();
  const claimed = await prisma.adminLoginToken.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date(), sessionHash: adminTokenHash(session), sessionExpiresAt: new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60_000) },
  });
  if (claimed.count !== 1) throw invalid();
  return session;
}

/** Redeems the current code for an email address. Unknown addresses fail exactly like a wrong code. */
export async function verifyAdminCodeForEmail(value: string, code: string) {
  const email = normalizeEmail(value);
  if (!/^\d{6}$/.test(code)) throw new Error('INVALID_ADMIN_CODE');
  const user = isAdminEmail(email) ? await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } }) : null;
  const token = user ? await prisma.adminLoginToken.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() }, codeHash: { not: PASSWORD_ATTEMPT } },
    orderBy: { createdAt: 'desc' }, select: { id: true },
  }) : null;
  if (!token) {
    await bcrypt.compare(code, await unusableHash());
    throw new Error('INVALID_ADMIN_CODE');
  }
  return verifyAdminCode(token.id, code);
}

export async function adminUserForSession(session: string) {
  if (!/^[a-f0-9]{64}$/.test(session)) return null;
  const token = await prisma.adminLoginToken.findUnique({ where: { sessionHash: adminTokenHash(session) }, include: { user: true } });
  if (!token?.usedAt || !token.sessionExpiresAt || token.sessionExpiresAt <= new Date() || token.user.deletedAt || !isAdminEmail(token.user.email)) return null;
  return token.user;
}

export async function revokeAdminSession(session: string) {
  await prisma.adminLoginToken.updateMany({ where: { sessionHash: adminTokenHash(session) }, data: { sessionHash: null, sessionExpiresAt: null } });
}

// Password sign-in for the original cookie portal (/api/admin/auth) only, until that route is removed.
// Reuses the revocable admin-session store without creating an email challenge.
export async function signInAdminPassword(value: string, password: string) {
  const email = normalizeEmail(value);
  const user = isAdminEmail(email) ? await prisma.user.findFirst({ where: { email, deletedAt: null } }) : null;
  if (!user) throw new Error('INVALID_ADMIN_PASSWORD');
  const attempt = await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
    const recent = await tx.adminLoginToken.count({ where: { userId: user.id, codeHash: PASSWORD_ATTEMPT, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
    if (recent >= 5) throw new Error('RATE_LIMITED');
    return tx.adminLoginToken.create({ data: { id: opaqueToken(), userId: user.id, codeHash: PASSWORD_ATTEMPT, expiresAt: new Date(), usedAt: new Date() } });
  });
  const authenticated = await login(email, password);
  if (!authenticated || !authenticated.emailVerifiedAt) throw new Error('INVALID_ADMIN_PASSWORD');
  const session = opaqueToken();
  await prisma.adminLoginToken.update({ where: { id: attempt.id }, data: { sessionHash: adminTokenHash(session), sessionExpiresAt: new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60_000) } });
  return session;
}
