import { ScheduleWarning } from './schedule-warning';
import { NextResponse } from 'next/server';
import { log } from './logger';

export function jsonError(err: unknown) {
  if (err instanceof Error && ['AUTH_RATE_LIMITED', 'BOT_CHECK_FAILED', 'SIGNUP_SECURITY_UNAVAILABLE', 'DISPOSABLE_EMAIL', 'INVALID_EMAIL_DOMAIN'].includes(err.message)) {
    const messages: Record<string, string> = { AUTH_RATE_LIMITED: 'Too many attempts. Please try again later.', BOT_CHECK_FAILED: 'Please complete the security check and try again.', SIGNUP_SECURITY_UNAVAILABLE: 'Account security checks are temporarily unavailable. Please try again shortly.', DISPOSABLE_EMAIL: 'Please use a permanent email address to create your Nexdo account.', INVALID_EMAIL_DOMAIN: 'Please enter a valid email address.' };
    return NextResponse.json({ error: messages[err.message] }, { status: err.message === 'AUTH_RATE_LIMITED' ? 429 : err.message === 'SIGNUP_SECURITY_UNAVAILABLE' ? 503 : 400 });
  }
  if (err instanceof Error && err.message === 'TASK_CHANGED') return NextResponse.json({ error: 'Your task changed. Refresh and try again.' }, { status: 409 });
  if (err instanceof Error && err.message === 'INVALID_TASK_STATE') return NextResponse.json({ error: 'Restore this task before starting it.' }, { status: 409 });
  if (err instanceof ScheduleWarning) return NextResponse.json({ code: 'SCHEDULE_WARNING', error: err.message, warnings: err.warnings }, { status: 409 });
  if (err instanceof Error && err.message === 'INVALID_PROJECT') return NextResponse.json({ error: 'Enter a project name of 1–80 characters and a valid color.' }, { status: 400 });
  if (err && typeof err === 'object' && 'code' in err && ['P2034', 'P2028'].includes(String(err.code))) return NextResponse.json({ error: 'Your data changed while this request was processing. Refresh and try again.' }, { status: 409 });
  if (err instanceof Error && ['INVALID_LOCAL_TIME', 'INVALID_TASK'].includes(err.message)) return NextResponse.json({ error: err.message === 'INVALID_LOCAL_TIME' ? 'That local time does not exist. Choose a valid time outside the daylight-saving clock change.' : 'Enter a valid task title, date, and positive duration.' }, { status: 400 });
  if (err instanceof Error && err.message === 'SESSION_CONFIGURATION_REQUIRED') return NextResponse.json({ error: 'Sign-in is unavailable until the server security configuration is completed.' }, { status: 503 });
  if (err instanceof Error && err.message === 'INVALID_ACCOUNT_INPUT') return NextResponse.json({ error: 'Enter a valid name and email address.' }, { status: 400 });
  if (err instanceof Error && err.message === 'PASSWORD_POLICY') return NextResponse.json({ error: 'Use a password with at least 12 characters (72 bytes maximum).' }, { status: 400 });
  if (err instanceof Error && err.message === 'ACCOUNT_EXISTS') return NextResponse.json({ error: 'An account with this email already exists. Sign in or reset your password.' }, { status: 409 });
  if (err instanceof Error && err.message === 'INVALID_VERIFICATION_CONTEXT') return NextResponse.json({ error: 'Please sign in with your password to continue verification, or reset your password.' }, { status: 400 });
  if (err instanceof Error && err.message === 'INVALID_RESET_CODE') return NextResponse.json({ error: 'That verification code is invalid, expired, or already used.' }, { status: 400 });
  if (err instanceof Error && err.message === 'INVALID_VERIFICATION_CODE') return NextResponse.json({ error: 'That verification code is invalid, expired, or already used. Send a new code and try again.' }, { status: 400 });
  if (err instanceof Error && err.message === 'EMAIL_UNAVAILABLE') return NextResponse.json({ error: 'We couldn’t send the email right now. Please try again in a few minutes.' }, { status: 503 });
  if (err instanceof Error && err.message === 'APPLE_AUTH_CONFIGURATION_REQUIRED') return NextResponse.json({ error: 'Sign in with Apple is not configured on the server yet.' }, { status: 503 });
  if (err instanceof Error && ['INVALID_APPLE_CREDENTIAL', 'APPLE_EMAIL_REQUIRED'].includes(err.message)) return NextResponse.json({ error: 'Apple could not verify this sign-in. Please try again and allow email access.' }, { status: 401 });
  if (err instanceof Error && err.message === 'APPLE_REVOCATION_FAILED') return NextResponse.json({ error: 'Apple authorization could not be revoked. Please try deleting the account again.' }, { status: 502 });
  if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  if (err instanceof Error && err.message === 'NOT_FOUND') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  log('error', 'api.unhandled', { message: err instanceof Error ? err.name : 'unknown' });
  return NextResponse.json({ error: 'Request failed.' }, { status: 500 });
}

export async function withUser<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    return jsonError(err);
  }
}
