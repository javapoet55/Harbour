import { healthContext } from './health/telemetry';
import { normalizeEmail } from './account-auth';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { readSession } from './session';
import { userForSession } from './session-store';

export async function login(email: string, password: string) {
  if (process.env.NODE_ENV === 'production' && password === 'harbor-demo') return null;
  if (!password || Buffer.byteLength(password, 'utf8') > 72) return null;
  let normalized: string;
  try { normalized = normalizeEmail(email); } catch { return null; }
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: normalized }, { email: normalized.toLowerCase() }], deletedAt: null },
  });
  if (!user || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

export async function currentUser() {
  const session = await readSession();
  if (!session) return null;
  if (session.sessionId) return userForSession(session.sessionId, session.userId);
  // Cookie from before server-side sessions (no session id). It keeps working until its own 14-day expiry
  // unless the user has since signed out everywhere or changed their password. Remove this branch once
  // every such cookie has expired: 14 days after this code first reached production.
  const user = await prisma.user.findFirst({
    where: { id: session.userId, deletedAt: null, emailVerifiedAt: { not: null } },
    include: { preference: true },
  });
  if (!user || (user.sessionsRevokedAt && session.issuedAt <= user.sessionsRevokedAt)) return null;
  return user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  const context = healthContext.getStore();
  if (context) context.userId = user.id;
  return user;
}
