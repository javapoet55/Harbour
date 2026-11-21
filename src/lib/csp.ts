// Content Security Policy for every page. Scripts run only when they carry this response's nonce (Next
// adds it to its own scripts) or are loaded by a script that does ('strict-dynamic'). Injected markup
// cannot know the nonce, so a script smuggled into AI or user text does not run even if an escaping
// mistake ever let it reach the page. React escapes all such text already; this is the second lock.

/** A fresh, unguessable value per response. */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy(nonce: string, options: { development?: boolean } = {}) {
  const development = options.development ?? process.env.NODE_ENV !== 'production';
  // Cloudflare Turnstile (the sign-up bot check) is the only third party the pages load.
  const turnstile = 'https://challenges.cloudflare.com';
  const directives = [
    "default-src 'self'",
    // 'self' and the Turnstile host only matter to browsers without 'strict-dynamic'; modern ones ignore them.
    // Next's development server needs eval for hot reloading; production never allows it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${turnstile}${development ? " 'unsafe-eval'" : ''}`,
    // React writes style="" attributes into server-rendered HTML, which cannot carry a nonce.
    "style-src 'self' 'unsafe-inline'",
    // Profile photos are data: URLs, voice recordings blob: URLs, store logos come from https hosts.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `frame-src 'self' ${turnstile}`,
    // Only Nexdo's own pages may embed Nexdo (/mobile-preview does). Blocks clickjacking from other sites.
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(development ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
}

/** CSP_REPORT_ONLY=true reports violations in the browser console without blocking, for a first rollout. */
export function cspHeaderName(env: Record<string, string | undefined> = process.env) {
  return env.CSP_REPORT_ONLY === 'true' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
}
