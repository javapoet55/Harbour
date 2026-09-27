import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { jsonError } from '@/lib/http';

export class NutritionError extends Error {
  constructor(readonly code: keyof typeof responses) { super(code); }
}
const responses = {
  INVALID_INPUT: [400, 'Check the values and try again.'],
  INVALID_PHONE: [400, 'Enter a mobile number in international format, for example +14155550123.'],
  INVALID_CODE: [400, 'That code is invalid or expired. Send a new code and try again.'],
  PHONE_NOT_VERIFIED: [409, 'Verify your phone number before turning on check-in calls.'],
  CODE_THROTTLED: [429, 'Please wait a minute before requesting another code.'],
  CALL_COOLDOWN: [429, 'A test call was placed recently. Try again in a few minutes.'],
  OUTSIDE_CALL_WINDOW: [409, 'Calls can only be placed between 8:00 AM and 9:30 PM your time.'],
  SMS_UNAVAILABLE: [503, 'We couldn’t send the code right now. Please try again shortly.'],
  CALLS_UNAVAILABLE: [503, 'Check-in calls are not available yet.'],
  NOT_FOUND: [404, 'Not found.'],
} as const;

export function nutritionErrorResponse(error: unknown) {
  if (error instanceof NutritionError) {
    const [status, message] = responses[error.code];
    return NextResponse.json({ code: error.code, error: message }, { status });
  }
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ code: 'INVALID_INPUT', error: responses.INVALID_INPUT[1] }, { status: 400 });
  return jsonError(error);
}
