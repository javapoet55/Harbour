import { prisma } from './db';
import { adminTokenHash, requestAdminCode, verifyAdminCodeForEmail } from './admin-otp';
import { adminAudit, adminEmailTarget, adminIpTarget } from './admin-audit';

// Email-code sign-in for the admin frontend. Limits are counted from HealthAudit rows for every address,
// allowed or not, so neither responses nor limits reveal which emails are administrators.
const WINDOW_MS = 15 * 60_000;
export const ADMIN_CODE_REQUESTS_PER_EMAIL = 3;
export const ADMIN_CODE_REQUESTS_PER_IP = 10;
export const ADMIN_VERIFY_ATTEMPTS_PER_IP = 20;
const windowStart = () => new Date(Date.now() - WINDOW_MS);
// Short, non-reversible account reference for audit details. Never the address itself.
const accountRef = (email: string) => adminEmailTarget(email).slice(0, 'email:'.length + 12);

/**
 * Accepts a code request and starts delivery for allowlisted accounts. The caller answers the same way for
 * every address; `delivery` is returned only so tests can wait for it and never rejects.
 */
export async function requestAdminCodeApi(email: string, clientIp: string | null) {
  const emailTarget = adminEmailTarget(email);
  const ipTarget = adminIpTarget(clientIp);
  const [byEmail, byIp] = await Promise.all([
    prisma.healthAudit.count({ where: { action: 'ADMIN_CODE_REQUESTED', targetId: emailTarget, createdAt: { gte: windowStart() } } }),
    prisma.healthAudit.count({ where: { action: 'ADMIN_CODE_REQUESTED', detail: ipTarget, createdAt: { gte: windowStart() } } }),
  ]);
  if (byEmail >= ADMIN_CODE_REQUESTS_PER_EMAIL || byIp >= ADMIN_CODE_REQUESTS_PER_IP) {
    const perEmail = byEmail >= ADMIN_CODE_REQUESTS_PER_EMAIL;
    await adminAudit('anonymous', 'ADMIN_RATE_LIMITED', perEmail ? emailTarget : ipTarget, perEmail ? 'Admin code requests: limit per email reached' : 'Admin code requests: limit per IP reached');
    throw new Error('RATE_LIMITED');
  }
  // targetId is the email bucket and detail the IP bucket, so one row serves both limits.
  await adminAudit('anonymous', 'ADMIN_CODE_REQUESTED', emailTarget, ipTarget);
  const { delivery } = await requestAdminCode(email);
  return { delivery };
}

/** Redeems a code for the admin frontend and returns a bearer session. */
export async function verifyAdminCodeApi(email: string, code: string, clientIp: string | null) {
  const target = adminIpTarget(clientIp);
  const attempts = await prisma.healthAudit.count({
    where: { targetId: target, action: { in: ['ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED'] }, createdAt: { gte: windowStart() } },
  });
  if (attempts >= ADMIN_VERIFY_ATTEMPTS_PER_IP) {
    await adminAudit('anonymous', 'ADMIN_RATE_LIMITED', target, 'Admin sign-in blocked: too many code attempts from this IP');
    throw new Error('RATE_LIMITED');
  }
  let token: string;
  try {
    token = await verifyAdminCodeForEmail(email, code);
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_ADMIN_CODE') await adminAudit('anonymous', 'ADMIN_LOGIN_FAILED', target, `Sign-in code rejected for account ${accountRef(email)}`);
    throw error;
  }
  const session = await prisma.adminLoginToken.findUniqueOrThrow({
    where: { sessionHash: adminTokenHash(token) },
    select: { sessionExpiresAt: true, user: { select: { id: true, name: true, email: true } } },
  });
  await adminAudit(session.user.id, 'ADMIN_LOGIN', target, 'Email code sign-in via admin frontend');
  return { token, expiresAt: session.sessionExpiresAt!.toISOString(), user: session.user };
}
