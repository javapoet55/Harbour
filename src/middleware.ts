import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/signup', '/verify-email', '/reset-password', '/manifest.json', '/welcome', '/pricing', '/features/ai-assistant'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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
