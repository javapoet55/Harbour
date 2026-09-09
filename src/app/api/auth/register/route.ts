import { NextResponse } from 'next/server';
import { registerAccount } from '@/server/account-auth';
import { writeSession } from '@/server/session';
import { jsonError } from '@/lib/http';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await registerAccount({ name: String(body.name ?? ''), email: String(body.email ?? ''), password: String(body.password ?? '') });
    await writeSession(user.id);
    return NextResponse.json({ id: user.id, name: user.name, email: user.email }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
