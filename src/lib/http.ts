import { NextResponse } from 'next/server';
import { log } from './logger';

export function jsonError(err: unknown) {
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
