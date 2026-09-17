import { NextResponse } from 'next/server';
import { requestEmailVerification } from '@/server/account-auth';
import { jsonError } from '@/lib/http';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await requestEmailVerification(String(body.email ?? ''));
    return NextResponse.json({ message: 'If that account still needs verification, a new six-digit code has been sent. It expires in 24 hours.', ...result });
  } catch (error) {
    return jsonError(error);
  }
}
