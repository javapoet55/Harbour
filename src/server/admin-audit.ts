import { prisma } from './db';

// Admin security events are always recorded, independent of NEXDO_HEALTH_ENABLED.
export async function adminAudit(actorId: string, action: string, targetId: string, detail: string) {
  await prisma.healthAudit.create({ data: { actorId, action, targetId, detail } });
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
