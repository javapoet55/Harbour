// Cross-site request forgery defence for every request that changes data.
//
// The session cookie is SameSite=Lax, which already keeps it off cross-site POSTs. That alone leaves two
// gaps: other nexdoapp.com subdomains count as the "same site", and it relies on one browser feature.
// So each write is also checked against where the browser says it came from (Sec-Fetch-Site, then Origin).
// Page scripts cannot set or remove either header.
//
// Requests carrying neither header are not from a browser page: the iOS and Android apps, the cron
// workers and Twilio's webhooks. Forgery needs a victim's browser, so those pass and are authenticated
// by their own session cookie, secret or signature as before.

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

type RequestLike = { method: string; headers: Pick<Headers, 'get'> };
type Env = Record<string, string | undefined>;

function parseOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) ? url : null;
  } catch {
    return null; // Includes the literal "null" origin of sandboxed frames and redirected requests.
  }
}

/** Origins allowed to send writes besides the app's own: APP_URL and the comma-separated CSRF_TRUSTED_ORIGINS. */
function configuredOrigins(env: Env) {
  return [env.APP_URL, ...(env.CSRF_TRUSTED_ORIGINS ?? '').split(',')]
    .map((value) => parseOrigin(value)?.origin)
    .filter((value): value is string => Boolean(value));
}

function ownOrigin(origin: URL, request: RequestLike, env: Env) {
  // Behind Railway's proxy the request reaches Next over plain http, so compare the host the browser
  // addressed and require https separately.
  const hosts = [request.headers.get('host'), request.headers.get('x-forwarded-host')?.split(',')[0]]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean);
  if (!hosts.includes(origin.host.toLowerCase())) return false;
  return origin.protocol === 'https:' || LOCAL_HOSTS.has(origin.hostname) || env.NODE_ENV !== 'production';
}

/**
 * Why this request must be refused as a cross-site write, or null when it may proceed.
 * Reads (GET, HEAD, OPTIONS) always proceed; no GET endpoint changes data.
 */
export function crossSiteWriteReason(request: RequestLike, env: Env = process.env): string | null {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) return null;
  const site = request.headers.get('sec-fetch-site')?.trim().toLowerCase() ?? null;
  const originHeader = request.headers.get('origin');
  if (site === 'same-origin') return null;
  if (site === null && originHeader === null) return null; // Not a browser page: native app, worker or webhook.
  const origin = parseOrigin(originHeader);
  if (origin && (ownOrigin(origin, request, env) || configuredOrigins(env).includes(origin.origin))) return null;
  if (site === 'none' && originHeader === null) return null; // Started by the user directly; no site can cause this.
  return originHeader === null ? `sec-fetch-site:${site}` : `origin:${originHeader.slice(0, 200)}`;
}
