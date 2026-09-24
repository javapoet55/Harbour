import 'server-only';
import { isIP } from 'node:net';

/** Browser mutations must come from this admin domain. Missing or malformed origins fail closed. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? new URL(request.url).host;
  try {
    const url = new URL(origin ?? '');
    return ['https:', 'http:'].includes(url.protocol) && url.host === host;
  } catch { return false; }
}

/** The client IP as the first X-Forwarded-For hop (set by the hosting proxy), or null if it is not an IP. */
export function clientIp(request: Request) {
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || '';
  return isIP(first) ? first : null;
}
