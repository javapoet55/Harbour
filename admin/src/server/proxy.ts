import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import { BackendError, backendErrorMessage, backendFetch, type BackendOptions } from './backend';
import { ADMIN_COOKIE, clearSessionCookie, validToken } from './session';

const headers = { 'Cache-Control': 'private, no-store' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export function sessionExpired() {
  const response = json({ error: 'Your admin session expired. Sign in again.' }, 401);
  clearSessionCookie(response);
  return response;
}

export const requestToken = (request: NextRequest) => validToken(request.cookies.get(ADMIN_COOKIE)?.value);

/**
 * Calls the backend with the browser's session and relays a contract-checked result. A backend 401 clears
 * the cookie; other errors forward only the backend's { error } message.
 */
export async function proxyToBackend<T>(request: NextRequest, path: string, schema: z.ZodType<T>, options: Omit<BackendOptions, 'token'> = {}) {
  const token = requestToken(request);
  if (!token) return sessionExpired();
  let response: Response;
  try {
    response = await backendFetch(path, { ...options, token });
  } catch (error) {
    return error instanceof BackendError ? json({ error: error.message }, error.status) : json({ error: 'The request could not be completed.' }, 502);
  }
  if (response.status === 401) return sessionExpired();
  if (!response.ok) return json({ error: await backendErrorMessage(response, 'The request could not be completed.') }, response.status);
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? json(parsed.data) : json({ error: 'The admin backend returned an unexpected response.' }, 502);
}
