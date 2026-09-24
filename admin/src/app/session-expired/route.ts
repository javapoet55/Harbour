import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/server/session';

// Server components cannot change cookies, so a backend 401 while rendering redirects here first.
export function GET() {
  const response = new NextResponse(null, { status: 303, headers: { Location: '/login', 'Cache-Control': 'no-store' } });
  clearSessionCookie(response);
  return response;
}
