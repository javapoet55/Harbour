import { NextResponse } from 'next/server';
import { verifyEmail } from '@/server/account-auth';
import { writeSession } from '@/server/session';
import { jsonError } from '@/lib/http';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await verifyEmail(String(body.email ?? ''), String(body.code ?? ''));
    await writeSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
