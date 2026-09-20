import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { authenticateApple } from '@/server/apple-auth';
import { writeSession } from '@/server/session';
import { jsonError } from '@/lib/http';

async function healthHandlerPOST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await authenticateApple({
      authorizationCode: String(body.authorizationCode ?? ''),
      rawNonce: String(body.rawNonce ?? ''),
      givenName: typeof body.givenName === 'string' ? body.givenName : undefined,
      familyName: typeof body.familyName === 'string' ? body.familyName : undefined,
    });
    await writeSession(user.id);
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = healthRoute('POST /api/auth/apple', healthHandlerPOST);
