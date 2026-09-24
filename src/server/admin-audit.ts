import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { prisma } from './db';
import { normalizeEmail } from './account-auth';
import { sessionSigningKey } from './session-key';

// Admin security events are always recorded, independent of NEXDO_HEALTH_ENABLED.
export async function adminAudit(actorId: string, action: string, targetId: string, detail: string) {
  await prisma.healthAudit.create({ data: { actorId, action, targetId, detail } });
}

// Rate-limit keys and audit targets. Emails and IPs are stored only as keyed hashes (HMAC with the
// session secret), so the audit log never holds them in plain text and they cannot be looked up by guessing.
const keyedHash = (kind: string, value: string) => `${kind}:${createHmac('sha256', sessionSigningKey()).update(`${kind}:${value}`).digest('hex')}`;

export function adminIpTarget(value: string | null) {
  const ip = value?.trim() ?? '';
  return keyedHash('ip', isIP(ip) ? ip.toLowerCase() : 'unknown');
}

export function adminEmailTarget(value: string) {
  return keyedHash('email', normalizeEmail(value));
}

const INSIGHTS_TARGET = 'admin-insights';
export const ADMIN_INSIGHTS_HOURLY_LIMIT = 20;

/**
 * Counts an Ask Nexdo question against the admin's hourly allowance before any model call, so failed
 * answers still count. Records the range and question length only, never the question text.
 */
export async function claimAdminInsightsQuestion(adminId: string, detail: { days: number; from?: string; to?: string; questionLength: number }) {
  const recent = await prisma.healthAudit.count({
    where: { targetId: INSIGHTS_TARGET, actorId: adminId, action: 'ADMIN_INSIGHTS', createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
  });
  if (recent >= ADMIN_INSIGHTS_HOURLY_LIMIT) {
    await adminAudit(adminId, 'ADMIN_RATE_LIMITED', INSIGHTS_TARGET, 'Ask Nexdo hourly question limit reached');
    return false;
  }
  await adminAudit(adminId, 'ADMIN_INSIGHTS', INSIGHTS_TARGET, JSON.stringify({ days: detail.days, from: detail.from ?? null, to: detail.to ?? null, questionLength: detail.questionLength }));
  return true;
}
