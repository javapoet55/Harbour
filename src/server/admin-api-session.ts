import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { prisma } from './db';
import { normalizeEmail } from './account-auth';
import { adminTokenHash, signInAdminPassword } from './admin-otp';
import { adminAudit } from './admin-audit';

const IP_WINDOW_MS = 15 * 60_000;
export const ADMIN_IP_ATTEMPT_LIMIT = 20;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Rate-limit bucket for the admin frontend's reported client IP. Only a digest is stored. */
export function adminIpTarget(value: string | null) {
  const ip = value?.trim() ?? '';
  return `ip:${sha256(isIP(ip) ? ip.toLowerCase() : 'unknown')}`;
}

const accountFingerprint = (email: string) => sha256(normalizeEmail(email)).slice(0, 12);

/** Password sign-in for the admin frontend: per-IP limit on top of the per-account limit, fully audited. */
export async function signInAdminApi(email: string, password: string, clientIp: string | null) {
  const target = adminIpTarget(clientIp);
  const attempts = await prisma.healthAudit.count({
    where: { targetId: target, action: { in: ['ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED'] }, createdAt: { gte: new Date(Date.now() - IP_WINDOW_MS) } },
  });
  if (attempts >= ADMIN_IP_ATTEMPT_LIMIT) {
    await adminAudit('anonymous', 'ADMIN_RATE_LIMITED', target, 'Admin sign-in blocked: too many attempts from this IP');
    throw new Error('RATE_LIMITED');
  }
  let token: string;
  try {
    token = await signInAdminPassword(email, password);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'RATE_LIMITED') await adminAudit('anonymous', 'ADMIN_RATE_LIMITED', target, `Admin sign-in blocked: too many attempts for account ${accountFingerprint(email)}`);
    else if (reason === 'INVALID_ADMIN_PASSWORD') await adminAudit('anonymous', 'ADMIN_LOGIN_FAILED', target, `Password sign-in rejected for account ${accountFingerprint(email)}`);
    throw error;
  }
  const session = await prisma.adminLoginToken.findUniqueOrThrow({
    where: { sessionHash: adminTokenHash(token) },
    select: { sessionExpiresAt: true, user: { select: { id: true, name: true, email: true } } },
  });
  await adminAudit(session.user.id, 'ADMIN_LOGIN', target, 'Password sign-in via admin frontend');
  return { token, expiresAt: session.sessionExpiresAt!.toISOString(), user: session.user };
}
