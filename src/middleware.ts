import { NextResponse, type NextRequest } from 'next/server';
import { adminAppUrl } from '@/lib/admin-app-url';
import { contentSecurityPolicy, createNonce, cspHeaderName } from '@/lib/csp';
import { crossSiteWriteReason } from '@/lib/csrf';

const PUBLIC = ['/signup-challenge', '/help', '/places-policy', '/login', '/signup', '/verify-email', '/reset-password', '/manifest.json', '/welcome', '/pricing', '/features/ai-assistant'];

/**
 * The admin portal moved to the standalone admin app. Old /admin links go to the same page there:
 * ADMIN_APP_URL + the path without /admin + the query string. Without ADMIN_APP_URL they are gone (404).
 */
function adminAppRedirect(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const target = adminAppUrl(`${pathname.slice('/admin'.length) || '/'}${search}`);
  return target ? NextResponse.redirect(target, 308) : new NextResponse('Not Found', { status: 404 });
}

/** Refuses a data-changing request that a page on another site caused the browser to send. */
function crossSiteWriteBlocked(req: NextRequest, reason: string) {
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', event: 'csrf.blocked', method: req.method, path: req.nextUrl.pathname, reason }));
  return NextResponse.json({ code: 'CROSS_SITE_REQUEST', error: 'This request was blocked because it did not come from Nexdo.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Lets a page render with a Content Security Policy. The nonce travels to Next on the request headers
 * (Next stamps it on its own scripts; the root layout reads x-nonce) and to the browser on the response.
 */
function page(req: NextRequest) {
  const nonce = createNonce();
  const policy = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(cspHeaderName(), policy);
  return response;
}

export function middleware(req: NextRequest) {
  const crossSite = crossSiteWriteReason(req);
  if (crossSite) return crossSiteWriteBlocked(req, crossSite);
  const { pathname } = req.nextUrl;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return adminAppRedirect(req);
  // APIs answer in JSON and files are not documents: no page policy, no login redirect.
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.includes('.')) return NextResponse.next();
  // Public share pages need no session.
  if (pathname.startsWith('/s/') || pathname.startsWith('/shared/shopping/')) return page(req);
  const session = req.cookies.get('harbor_session')?.value;
  if (!session && !PUBLIC.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return page(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
