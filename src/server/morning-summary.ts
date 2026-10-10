import { prisma } from '@/server/db';
import { emailProvider } from '@/providers';
import { buildTodayBriefing } from './schedule-intelligence';
import { renderEmail } from './email/template';
import { tzToday, ymd, zonedDateTime } from '@/lib/time';

/** A one-hour recovery window handles worker restarts, without sending stale evening briefs. */
export function morningDay(now: Date, timeZone: string): string | null {
  try {
    const day = ymd(tzToday(timeZone, now));
    const due = zonedDateTime(day, '06:00', timeZone);
    return +now >= +due && +now < +due + 3600000 ? day : null;
  } catch { return null; }
}
export async function runMorningSummaries(now = new Date(), scope?: { userId: string }) {
  const counts = { sent: 0, skipped: 0, failed: 0 };
  let cursor: string | undefined;
  do {
    const users = await prisma.user.findMany({
      where: { ...(scope ? { id: scope.userId } : {}), deletedAt: null, preference: { morningSummary: true, emailEnabled: true } },
      select: { id: true, email: true, timeZone: true }, orderBy: { id: 'asc' }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!users.length) break;
    cursor = users[users.length - 1].id;
    for (const user of users) {
      const day = morningDay(now, user.timeZone);
      if (!day) continue;
      const key = `morning-summary:${day}`;
      try {
        const existing = await prisma.userMemory.findUnique({ where: { userId_key: { userId: user.id, key } } });
        const previous = existing ? JSON.parse(existing.value) : null;
        // A sending/uncertain attempt is never automatically replayed: the provider may have accepted it.
        if (previous && (previous.status !== 'retry' || previous.attempts >= 3 || previous.retryAt > +now)) { counts.skipped++; continue; }
        const briefing = await buildTodayBriefing(user.id, now);
        const message = renderEmail({ heading: 'Your morning briefing', preheader: briefing.visual.summary,
          subheading: `${day} · ${user.timeZone}`, intro: briefing.visual.summary,
          body: briefing.visual.sections.flatMap(section => [section.title, ...section.items]),
          footerNote: 'Sent at 6:00 a.m. in your profile time zone. Disable Daily morning email in NexDo Settings to stop these emails.',
          ignoreNote: 'Based on tasks and calendars synced to NexDo. Device-only Apple Calendar events are not included.',
        });
        // Recheck settings and destination after rendering, immediately before claiming delivery.
        const current = await prisma.user.findFirst({ where: { id: user.id, deletedAt: null, preference: { morningSummary: true, emailEnabled: true } }, select: { email: true, timeZone: true } });
        if (!current || current.timeZone !== user.timeZone) { counts.skipped++; continue; }
        const attempt = { status: 'sending', attempts: (previous?.attempts ?? 0) + 1, startedAt: +now };
        const value = JSON.stringify(attempt);
        let id: string;
        if (existing) {
          const claim = await prisma.userMemory.updateMany({ where: { id: existing.id, value: existing.value }, data: { value } });
          if (!claim.count) { counts.skipped++; continue; }
          id = existing.id;
        } else {
          try { id = (await prisma.userMemory.create({ data: { userId: user.id, key, kind: 'runtime', source: 'morning-summary', value } })).id; }
          catch (error) { if ((error as { code?: string }).code === 'P2002') { counts.skipped++; continue; } throw error; }
        }
        let result;
        try { result = await emailProvider.send({ to: current.email, subject: `NexDo morning briefing — ${day}`, ...message }); }
        catch { result = { status: 'FAILED' as const }; }
        const status = result.status === 'SENT' ? 'sent' : ('providerStatus' in result && result.providerStatus ? 'retry' : 'uncertain');
        await prisma.userMemory.updateMany({ where: { id, value }, data: { value: JSON.stringify({ ...attempt, status, retryAt: +now + 5 * 60000 }) } });
        if (status === 'sent') counts.sent++; else counts.failed++;
      } catch { counts.failed++; }
    }
  } while (!scope);
  return counts;
}
