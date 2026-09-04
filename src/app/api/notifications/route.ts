import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { acknowledgeReminder, tickReminders } from '@/server/reminders';

export async function GET() {
  const user = await requireUser();
  const reminders = await prisma.reminder.findMany({
    where: { userId: user.id },
    include: { attempts: true, task: true },
    orderBy: { fireAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ reminders });
}

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  if (body.action === 'tick') {
    return NextResponse.json(await tickReminders());
  }
  if (body.action === 'ack' && body.reminderId) {
    await acknowledgeReminder(user.id, body.reminderId);
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'test') {
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
        channel: 'push',
        status: 'SENT',
        sentAt: new Date(),
        providerId: 'test-notification',
      },
    });
    return NextResponse.json({ ok: true, message: 'Test notification recorded as sent.' });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
