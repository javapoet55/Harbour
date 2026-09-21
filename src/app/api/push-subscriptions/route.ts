import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { jsonError } from '@/lib/http';

async function healthHandlerGET() {
  try {
    await requireUser();
    return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '', configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) });
  } catch (error) { return jsonError(error); }
}

async function healthHandlerPOST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const endpoint = String(body.endpoint || '');
    const p256dh = String(body.keys?.p256dh || '');
    const auth = String(body.keys?.auth || '');
    if (!endpoint.startsWith('https://') || !p256dh || !auth) return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 });
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: user.id, p256dh, auth, userAgent: req.headers.get('user-agent') || '' },
      create: { userId: user.id, endpoint, p256dh, auth, userAgent: req.headers.get('user-agent') || '' },
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

async function healthHandlerDELETE(req: Request) {
  try {
    const user = await requireUser();
    const endpoint = String((await req.json()).endpoint || '');
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

export const GET = healthRoute('GET /api/push-subscriptions', healthHandlerGET);

export const POST = healthRoute('POST /api/push-subscriptions', healthHandlerPOST);

export const DELETE = healthRoute('DELETE /api/push-subscriptions', healthHandlerDELETE);
