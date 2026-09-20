import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { acknowledgeReminder, tickReminders } from '@/server/reminders';
import { emailProvider, pushProvider, smsProvider } from '@/providers';

async function healthHandlerGET() {
  const user = await requireUser();
  const reminders = await prisma.reminder.findMany({
    where: { userId: user.id },
    include: { attempts: true, task: true },
    orderBy: { fireAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ reminders });
}

async function healthHandlerPOST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.action === 'tick') {
    const cronSecret = process.env.HARBOR_CRON_SECRET;
    if (cronSecret) {
      const supplied = req.headers.get('authorization');
      if (supplied !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Invalid cron authorization.' }, { status: 401 });
    } else {
      await requireUser();
    }
    return NextResponse.json(await tickReminders());
  }
  const user = await requireUser();
  if (body.action === 'ack' && body.reminderId) {
    await acknowledgeReminder(user.id, body.reminderId);
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'test') {
    const channel = body.channel === 'email' || body.channel === 'sms' ? body.channel : 'push';
    const result = channel === 'email'
      ? await emailProvider.send({ to: user.email, subject: 'Harbour test notification', text: 'Your email notifications are working.' })
      : channel === 'sms'
        ? user.preference?.phoneNumber
          ? await smsProvider.send({ to: user.preference.phoneNumber, text: 'Harbour: your SMS notifications are working.' })
          : { id: '', status: 'FAILED' as const, reason: 'Add a phone number in Settings first.' }
        : await pushProvider.send({ userId: user.id, title: 'Harbour test', body: 'Your browser notifications are working.' });
    await prisma.notificationAttempt.create({
      data: {
        reminder: {
          create: {
            userId: user.id,
            fireAt: new Date(),
            offsetLabel: 'test',
            status: 'QUEUED',
            idempotencyKey: `test:${user.id}:${Date.now()}`,
          },
        },
        channel,
        status: result.status,
        failureReason: result.reason,
        sentAt: result.status === 'SENT' ? new Date() : null,
        providerId: result.id,
      },
    });
    return NextResponse.json({ ok: result.status === 'SENT', message: result.status === 'SENT' ? `Test ${channel} sent.` : `Test ${channel} failed: ${result.reason}` }, { status: result.status === 'SENT' ? 200 : 502 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export const GET = healthRoute('GET /api/notifications', healthHandlerGET);

export const POST = healthRoute('POST /api/notifications', healthHandlerPOST);
