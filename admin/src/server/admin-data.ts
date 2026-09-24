import 'server-only';
import { notFound, redirect } from 'next/navigation';
import type { z } from 'zod';
import { BackendError, backendJson } from './backend';
import { SESSION_EXPIRED_PATH, sessionToken } from './session';

/**
 * Loads backend data for a server-rendered page. No session goes to /login; a backend 401 goes through
 * /session-expired, which clears the cookie. A 404 renders the not-found page.
 */
export async function adminData<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const token = await sessionToken();
  if (!token) redirect('/login');
  let status = 0;
  try {
    return await backendJson(path, schema, { token });
  } catch (error) {
    if (!(error instanceof BackendError) || (error.status !== 401 && error.status !== 404)) throw error;
    status = error.status;
  }
  // redirect() and notFound() throw, so they must run outside the try block.
  if (status === 404) notFound();
  redirect(SESSION_EXPIRED_PATH);
}
