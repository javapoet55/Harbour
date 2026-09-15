import { NextResponse } from 'next/server';
import { login } from '@/server/auth';
import { writeSession } from '@/server/session';
import { jsonError } from '@/lib/http';

export async function POST(req: Request) {
  try {
  const body = await req.json().catch(() => ({}));
  const user = await login(String(body.email ?? ''), String(body.password ?? ''));
  if (!user) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  if (!user.emailVerifiedAt) {
    return NextResponse.json({ code: 'EMAIL_NOT_VERIFIED', error: 'Verify your email address to sign in.', email: user.email }, { status: 403 });
  }
  await writeSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (error) { return jsonError(error); }
}
