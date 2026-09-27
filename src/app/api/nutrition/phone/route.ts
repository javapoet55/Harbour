import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { nutritionErrorResponse } from '@/server/nutrition/errors';
import { startPhoneVerification, verifyPhone } from '@/server/nutrition/settings';

const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), phone: z.string().max(20) }).strict(),
  z.object({ action: z.literal('verify'), code: z.string().max(10) }).strict(),
]);
/** { action: 'start', phone: '+14155550123' } sends an SMS code; { action: 'verify', code: '123456' } confirms it. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = input.parse(await request.json());
    return NextResponse.json(body.action === 'start'
      ? await startPhoneVerification(user.id, user.timeZone, body.phone)
      : await verifyPhone(user.id, user.timeZone, body.code));
  } catch (error) { return nutritionErrorResponse(error); }
}
