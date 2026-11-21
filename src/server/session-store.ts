import { randomBytes } from 'node:crypto';
import type { Prisma } from '@/generated/prisma';
import { prisma } from './db';

// Server-side record of every signed-in browser and app. The session cookie only names a row here, so
// deleting the row signs that device out at once, wherever a copy of its cookie may be.
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** How often an active session's lastSeenAt is written. Bounds the extra write to one per window. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;

function setting(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

/** Absolute lifetime: however active, a device signs in again after this long. SESSION_MAX_AGE_DAYS, default 14. */
export const sessionMaxAgeMs = () => setting(process.env.SESSION_MAX_AGE_DAYS, 14, 90) * DAY_MS;
/** Idle lifetime: a device that has not used Nexdo for this long is signed out. SESSION_IDLE_TIMEOUT_HOURS, default 7 days. */
export const sessionIdleMs = () => Math.min(setting(process.env.SESSION_IDLE_TIMEOUT_HOURS, 7 * 24, 90 * 24) * HOUR_MS, sessionMaxAgeMs());

type SessionTimes = { lastSeenAt: Date; expiresAt: Date };
export function sessionActive(session: SessionTimes, now = new Date()) {
  return session.expiresAt > now && now.getTime() - session.lastSeenAt.getTime() < sessionIdleMs();
}

/** A sign-in without "Remember me" lasts at most this long, even if the browser is never closed. */
export const UNREMEMBERED_SESSION_MS = DAY_MS;

/**
 * Starts a session for this user and removes that user's dead ones, so the table needs no cleanup job.
 * `remember: false` is a sign-in on a browser the user does not want to stay signed in on.
 */
export async function createSession(userId: string, options: { remember?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const id = randomBytes(32).toString('hex');
  const lifetime = options.remember === false ? Math.min(UNREMEMBERED_SESSION_MS, sessionMaxAgeMs()) : sessionMaxAgeMs();
  const expiresAt = new Date(now.getTime() + lifetime);
  await prisma.$transaction([
    prisma.userSession.deleteMany({ where: { userId, OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lte: new Date(now.getTime() - sessionIdleMs()) } }] } }),
    prisma.userSession.create({ data: { id, userId, lastSeenAt: now, expiresAt } }),
  ]);
  return { id, expiresAt };
}

/** The signed-in user behind a session id, or null when the session is unknown, expired, idle or not this user's. */
export async function userForSession(id: string, userId: string, now = new Date()) {
  const session = await prisma.userSession.findUnique({ where: { id }, include: { user: { include: { preference: true } } } });
  if (!session || session.userId !== userId || !sessionActive(session, now)) return null;
  if (session.user.deletedAt || !session.user.emailVerifiedAt) return null;
  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    // Activity tracking must never fail the request it is observing.
    await prisma.userSession.updateMany({ where: { id }, data: { lastSeenAt: now } }).catch(() => undefined);
  }
  return session.user;
}

export async function revokeSession(id: string) {
  await prisma.userSession.deleteMany({ where: { id } });
}

/**
 * Signs the user out of every browser and app, and of the admin app. sessionsRevokedAt also refuses
 * cookies issued before server-side sessions existed, which have no row to delete.
 */
export async function revokeAllSessions(userId: string, db: Prisma.TransactionClient = prisma, now = new Date()) {
  await db.userSession.deleteMany({ where: { userId } });
  await db.user.updateMany({ where: { id: userId }, data: { sessionsRevokedAt: now } });
  // "Everywhere" includes the admin app, for accounts that can sign in there.
  await db.adminLoginToken.updateMany({ where: { userId, sessionHash: { not: null } }, data: { sessionHash: null, sessionExpiresAt: null } });
}
