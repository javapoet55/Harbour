import 'server-only';
import type { z } from 'zod';
import { backendErrorSchema } from '@/contract/session';

// Server-side client for the Nexdo backend's /api/admin/* endpoints. The browser never talks to the backend.
export class BackendError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'BackendError'; }
}

const DEFAULT_TIMEOUT_MS = 30_000;
// Ask Nexdo can take up to four model round trips of 20 s each on the backend.
export const INSIGHTS_TIMEOUT_MS = 90_000;

function backendConfig() {
  const base = process.env.BACKEND_URL?.trim().replace(/\/+$/, '');
  const secret = process.env.ADMIN_API_SECRET?.trim();
  if (!base || !secret) throw new BackendError(503, 'The admin backend is not configured.');
  return { base, secret };
}

export type BackendOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  token?: string | null;
  body?: unknown;
  clientIp?: string | null;
  timeoutMs?: number;
};

export async function backendFetch(path: string, options: BackendOptions = {}) {
  if (!path.startsWith('/api/admin/')) throw new Error('Only backend admin API paths may be requested.');
  const { base, secret } = backendConfig();
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Admin-Client': secret };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.clientIp) headers['X-Admin-Client-IP'] = options.clientIp;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    return await fetch(`${base}${path}`, {
      method: options.method ?? 'GET', headers, cache: 'no-store', redirect: 'error',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new BackendError(504, 'The admin backend took too long to respond. Try again.');
    throw new BackendError(503, 'The admin backend could not be reached. Try again shortly.');
  }
}

/** The backend's { error } message, or the fallback. Never forwards anything else from the body. */
export async function backendErrorMessage(response: Response, fallback: string) {
  const parsed = backendErrorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.slice(0, 300) : fallback;
}

/** Fetch and validate a backend response against its contract schema. */
export async function backendJson<T>(path: string, schema: z.ZodType<T>, options: BackendOptions = {}): Promise<T> {
  const response = await backendFetch(path, options);
  if (!response.ok) throw new BackendError(response.status, await backendErrorMessage(response, 'The admin backend returned an error.'));
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new BackendError(502, 'The admin backend returned an unexpected response.');
  return parsed.data;
}
