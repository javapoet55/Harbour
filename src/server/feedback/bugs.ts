import { z } from 'zod';
import { adminAppUrl } from '@/lib/admin-app-url';
import sharp from 'sharp';
import { prisma } from '@/server/db';
import { encryptCredential } from '@/lib/credentials';
import { consumeLimit } from '@/server/signup/abuse';
import { emailProvider, emailDeliveryMocked } from '@/providers';

export const bugSchema = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(1).max(2000),
  metadata: z.object({
    appVersion: z.string().regex(/^[0-9.]{1,30}$/), buildNumber: z.string().regex(/^[0-9.]{1,30}$/),
    deviceModel: z.string().regex(/^[A-Za-z0-9, ._-]{1,60}$/), iosVersion: z.string().regex(/^[0-9.]{1,30}$/),
    screen: z.enum(['today','tasks','calendar','askAI','shopping','moments','calories','pomodoro','wellness','settings','app']),
    timestamp: z.string().datetime(), correlationID: z.string().uuid(),
  }).strict(),
  screenshotConsent: z.boolean(), screenshot: z.string().max(2_800_000).optional(),
}).strict().refine(x => !x.screenshot || x.screenshotConsent, 'Screenshot consent required');
export type BugInput = z.infer<typeof bugSchema>;
export const referenceFor = (id: string) => `BR-${id.replaceAll('-', '').toUpperCase()}`;
// Do not copy credential-shaped text into feedback, email, or diagnostics. Never log request bodies.
export function redactSecrets(value: string) {
  return value.replace(/\b(?:password|passwd|api[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|authorization)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]');
}
export async function screenshotCipher(input: BugInput) {
  if (!input.screenshot) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.screenshot)) throw new Error('INVALID_SCREENSHOT');
  let jpeg: Buffer;
  try {
    const bytes = Buffer.from(input.screenshot, 'base64');
    if (bytes.length > 2_000_000) throw new Error();
    const image = sharp(bytes, { limitInputPixels: 4_000_000, animated: false });
    const meta = await image.metadata();
    if (!['png', 'jpeg'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error();
    // Re-encode: no EXIF, embedded payloads, GPS or other file metadata retained.
    jpeg = await image.resize({ width: 1170, height: 2532, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  } catch { throw new Error('INVALID_SCREENSHOT'); }
  return encryptCredential(jpeg.toString('base64'));
}
export async function saveBug(user: { id: string; name: string }, input: BugInput, now = new Date()) {
  const existing = await prisma.feedback.findUnique({ where: { id: input.id }, include: { bugReport: true } });
  if (existing) {
    if (existing.userId !== user.id || !existing.bugReport) throw new Error('BUG_ID_CONFLICT');
    return existing.bugReport.reference;
  }
  await consumeLimit('bug-report-create', user.id, 5, 86_400_000);
  const screenshot = await screenshotCipher(input);
  const reference = referenceFor(input.id);
  // Atomic parent+outbox write. Success means durable receipt, not successful email delivery.
  const saved = await prisma.feedback.upsert({ where: { id: input.id }, update: {}, create: {
    id: input.id, userId: user.id, customerName: "NexDo user", title: `Bug report ${reference}`,
    description: redactSecrets(input.description), stars: 0,
    bugReport: { create: { reference, metadata: JSON.stringify(input.metadata), screenshot,
      screenshotExpiresAt: new Date(+now + 7 * 86400000), expiresAt: new Date(+now + 90 * 86400000) } },
  }, include: { bugReport: true } }).catch(async error => {
    // Nested upserts can race before INSERT. Recover only a confirmed unique-key conflict.
    if (error?.code !== 'P2002') throw error;
    const duplicate = await prisma.feedback.findUnique({ where: { id: input.id }, include: { bugReport: true } });
    if (!duplicate) throw error;
    return duplicate;
  });
  if (saved.userId !== user.id || !saved.bugReport) throw new Error('BUG_ID_CONFLICT');
  return saved.bugReport.reference;
}

export async function maintainBugReports(now = new Date()) {
  await prisma.bugReport.updateMany({ where: { screenshotExpiresAt: { lte: now }, screenshot: { not: null } }, data: { screenshot: null } });
  await prisma.feedback.deleteMany({ where: { bugReport: { expiresAt: { lte: now } } } });
  const due = await prisma.bugReport.findMany({ where: { emailSentAt: null, nextAttemptAt: { lte: now },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, take: 10, orderBy: { nextAttemptAt: 'asc' }, select: { id: true } });
  let sent = 0;
  for (const item of due) {
    const leaseUntil = new Date(+now + 5 * 60000);
    const claim = await prisma.bugReport.updateMany({ where: { id: item.id, emailSentAt: null, nextAttemptAt: { lte: now }, expiresAt: { gt: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseUntil, attempts: { increment: 1 } } });
    if (!claim.count) continue;
    try {
      const row = await prisma.bugReport.findUniqueOrThrow({ where: { id: item.id }, include: { feedback: true } });
      // The support inbox receives no customer name/email, tokens, raw logs, or screenshot attachment.
      // Screenshots stay behind admin authentication and their retention deadline.
      const screenshotURL = adminAppUrl(`/api/admin/feedback/bugs/${row.id}/screenshot`);
      const screenshotLink = row.screenshot && screenshotURL?.protocol === 'https:' ? `\nScreenshot (authorized support access, expires after 7 days): ${screenshotURL}` : '';
      if (emailDeliveryMocked()) throw new Error('EMAIL_NOT_CONFIGURED');
      const result = await emailProvider.send({ to: 'support@nexdoapp.com', subject: `NexDo bug report ${row.reference}`,
        text: `${row.reference}\n\n${row.feedback.description}\n\nDiagnostics:\n${row.metadata}${screenshotLink}` });
      if (result.status !== 'SENT') throw new Error('EMAIL_FAILED');
      await prisma.bugReport.updateMany({ where: { id: row.id, leaseUntil }, data: { emailSentAt: new Date(), leaseUntil: null } }); sent++;
    } catch {
      // Keep the durable outbox for retry. Reference ID allows support to identify rare delivery duplicates.
      await prisma.bugReport.updateMany({ where: { id: item.id, leaseUntil }, data: { leaseUntil: null, nextAttemptAt: new Date(+now + 15 * 60000) } });
    }
  }
  return { sent };
}
