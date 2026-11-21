// Content Security Policy for the admin pages. Scripts run only when they carry this response's nonce
// (Next adds it to its own) or are loaded by one that does. The admin loads nothing from other hosts.

/** A fresh, unguessable value per response. */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy(nonce: string, options: { development?: boolean } = {}) {
  const development = options.development ?? process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    // Next's development server needs eval for hot reloading; production never allows it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    // Charts and tables set style="" attributes, which cannot carry a nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(development ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
