/**
 * An absolute URL in the standalone admin app, or null when ADMIN_APP_URL is unset or not an http(s) URL.
 * `path` starts with "/" and may carry a query string.
 */
export function adminAppUrl(path = '/') {
  const base = process.env.ADMIN_APP_URL?.trim().replace(/\/+$/, '');
  if (!base) return null;
  try {
    const url = new URL(`${base}${path}`);
    return ['https:', 'http:'].includes(url.protocol) ? url : null;
  } catch {
    return null; // A malformed ADMIN_APP_URL fails closed.
  }
}
