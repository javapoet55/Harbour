import { NextResponse, type NextRequest } from 'next/server';
import { adminAppUrl } from '@/lib/admin-app-url';

const PUBLIC = ['/places-policy', '/login', '/signup', '/verify-email', '/reset-password', '/manifest.json', '/welcome', '/pricing', '/features/ai-assistant'];

/**
 * The admin portal moved to the standalone admin app. Old /admin links go to the same page there:
 * ADMIN_APP_URL + the path without /admin + the query string. Without ADMIN_APP_URL they are gone (404).
 */
function adminAppRedirect(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const target = adminAppUrl(`${pathname.slice('/admin'.length) || '/'}${search}`);
  return target ? NextResponse.redirect(target, 308) : new NextResponse('Not Found', { status: 404 });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return adminAppRedirect(req);
  if (pathname.startsWith('/shared/shopping/') || pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }
  const session = req.cookies.get('harbor_session')?.value;
  if (!session && !PUBLIC.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
