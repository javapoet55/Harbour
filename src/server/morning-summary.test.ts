import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db';
import { emailProvider } from '@/providers';
import { morningDay, runMorningSummaries } from './morning-summary';
import { POST } from '@/app/api/notifications/morning-tick/route';

const now = new Date('2026-10-10T13:00:00Z');
let userId: string;
beforeEach(async () => {
  userId = (await prisma.user.create({ data: { email: `morning-${crypto.randomUUID()}@example.test`, name: 'Morning Test', passwordHash: 'unused', timeZone: 'America/Los_Angeles', preference: { create: { morningSummary: true, emailEnabled: true } } } })).id;
  vi.spyOn(emailProvider, 'send').mockResolvedValue({ status: 'SENT', id: 'test' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.user.delete({ where: { id: userId } });
});

describe('local morning delivery', () => {
  it.each([
    ['2026-03-08T13:00:00Z', 'America/Los_Angeles', '2026-03-08'],
    ['2026-11-01T14:00:00Z', 'America/Los_Angeles', '2026-11-01'],
    ['2026-10-10T00:15:00Z', 'Asia/Kathmandu', '2026-10-10'],
    ['2026-10-10T12:59:59Z', 'America/Los_Angeles', null],
    ['2026-10-10T14:00:00Z', 'America/Los_Angeles', null],
    ['2026-10-10T13:00:00Z', 'Invalid/Zone', null],
  ])('resolves %s in %s', (instant, zone, expected) => {
    expect(morningDay(new Date(instant), zone)).toBe(expected);
  });

  it('emails today’s tasks, events and conflicts to the current profile address, once per local day', async () => {
    await prisma.user.update({ where: { id: userId }, data: { email: `updated-${userId}@example.test` } });
    await prisma.task.create({ data: { userId, title: 'Call dentist', startAt: new Date('2026-10-10T17:00:00Z'), durationMin: 30 } });
    await prisma.calendarEvent.create({ data: { userId, title: 'Team meeting', startAt: new Date('2026-10-10T17:00:00Z'), endAt: new Date('2026-10-10T18:00:00Z') } });
    await prisma.task.create({ data: { userId, title: 'Tomorrow only', startAt: new Date('2026-10-11T17:00:00Z') } });
    expect((await runMorningSummaries(now, { userId })).sent).toBe(1);
    const email = vi.mocked(emailProvider.send).mock.calls[0][0];
    expect(email.to).toBe(`updated-${userId}@example.test`);
    expect(email.html).toContain('<h2');
    expect(email.html).toContain('Saturday, October 10, 2026');
    expect(email.html).toContain('Pacific Daylight Time');
    expect(email.html).toContain('Open NexDo');
    expect(email.text).toContain('not one of your selected working days');
    expect(email.text).not.toContain('0 free minutes');
    expect(email.text).toContain('Call dentist');
    expect(email.text).toContain('Team meeting');
    expect(email.text).not.toContain('Tomorrow only');
    expect(email.text).toMatch(/overlap|conflict/i);
    await runMorningSummaries(new Date(+now + 60000), { userId });
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    await runMorningSummaries(new Date(+now + 86400000), { userId });
    expect(emailProvider.send).toHaveBeenCalledTimes(2);
  });

  it.each(['morningSummary', 'emailEnabled'] as const)('honors disabled %s', async field => {
    await prisma.userPreference.update({ where: { userId }, data: { [field]: false } });
    await runMorningSummaries(now, { userId });
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('does not send outside the window or to deleted accounts', async () => {
    await runMorningSummaries(new Date(+now - 1), { userId });
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: now } });
    await runMorningSummaries(now, { userId });
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('claims concurrent delivery only once', async () => {
    await Promise.all([runMorningSummaries(now, { userId }), runMorningSummaries(now, { userId })]);
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
  });

  it('retries a definitive provider rejection after five minutes', async () => {
    vi.mocked(emailProvider.send).mockResolvedValueOnce({ status: 'FAILED', id: 'rejected', providerStatus: 429 });
    await runMorningSummaries(now, { userId });
    await runMorningSummaries(new Date(+now + 60000), { userId });
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    await runMorningSummaries(new Date(+now + 300000), { userId });
    expect(emailProvider.send).toHaveBeenCalledTimes(2);
  });

  it('does not replay an ambiguous network outcome', async () => {
    vi.mocked(emailProvider.send).mockRejectedValueOnce(new Error('connection lost'));
    await runMorningSummaries(now, { userId });
    await runMorningSummaries(new Date(+now + 300000), { userId });
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated scheduler calls', async () => {
    expect((await POST(new Request('https://example.test/api/notifications/morning-tick', { method: 'POST' }))).status).toBe(401);
    expect(emailProvider.send).not.toHaveBeenCalled();
  });
});
