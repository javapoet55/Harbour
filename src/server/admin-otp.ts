import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { prisma } from './db';
import { normalizeEmail } from './account-auth';
import { isAdminEmail } from './admin-allowlist';
import { adminEmailConfigured, adminEmailProvider } from '@/providers/admin-email';

export const adminTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const opaqueToken = () => randomBytes(32).toString('hex');

export async function requestAdminCode(value: string) {
  const email = normalizeEmail(value);
  const id = opaqueToken();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const user = isAdminEmail(email) ? await prisma.user.findFirst({ where: { email, deletedAt: null } }) : null;
  // Identical public response for unknown and unauthorized accounts.
  if (!user) return id;
  // Never pretend a mock delivery grants access, including in development.
  if (!adminEmailConfigured()) throw new Error('EMAIL_UNAVAILABLE');
  const created = await prisma.$transaction(async (tx) => {
    // Serialize sends for this account across instances, including concurrent resends.
    await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
    const recent = await tx.adminLoginToken.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent.length >= 3 || (recent[0] && recent[0].createdAt.getTime() > Date.now() - 60_000)) throw new Error('RATE_LIMITED');
    await tx.adminLoginToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    return tx.adminLoginToken.create({ data: { id, userId: user.id, codeHash, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  });
  try {
    const delivery = await adminEmailProvider.send({
      to: email, subject: 'Your NEXDO Admin sign-in code',
      text: `Your NEXDO Admin sign-in code is ${code}. It expires in 10 minutes and can be used once. Never share this code. If you did not request it, ignore this email.`,
    });
    if (delivery.status === 'FAILED') throw new Error('EMAIL_UNAVAILABLE');
  } catch {
    await prisma.adminLoginToken.update({ where: { id: created.id }, data: { usedAt: new Date() } });
    throw new Error('EMAIL_UNAVAILABLE');
  }
  return id;
}

export async function verifyAdminCode(id: string, code: string) {
  const invalid = () => new Error('INVALID_ADMIN_CODE');
  if (!/^[a-f0-9]{64}$/.test(id) || !/^\d{6}$/.test(code)) throw invalid();
  const token = await prisma.adminLoginToken.findUnique({ where: { id }, include: { user: true } });
  if (!token || token.usedAt || token.expiresAt <= new Date() || token.user.deletedAt || !isAdminEmail(token.user.email)) throw invalid();
  const counted = await prisma.adminLoginToken.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1 || !await bcrypt.compare(code, token.codeHash)) throw invalid();
  const session = opaqueToken();
  const claimed = await prisma.adminLoginToken.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date(), sessionHash: adminTokenHash(session), sessionExpiresAt: new Date(Date.now() + 8 * 60 * 60_000) },
  });
  if (claimed.count !== 1) throw invalid();
  return session;
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
