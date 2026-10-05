import { healthRoute } from '@/server/health/telemetry';
import { NextRequest, NextResponse } from 'next/server';
import { connectCalendar, type OAuthProvider } from '@/providers/calendar';
import { isNativeOAuthState, verifyOAuthState } from '@/server/oauth-state';
import { syncConnection } from '@/server/calendar-sync';

function valid(value: string): value is OAuthProvider { return value === 'google' || value === 'microsoft'; }

function settingsRedirect(params: Record<string, string>, native = false) {
  if (native) return new NextResponse(null, { status: 303, headers: { Location: `nexdo://calendar-connected?${new URLSearchParams(params)}`, 'Cache-Control': 'no-store' } });
  // Resolve in the browser against the public origin, never the server's bind
  // address (e.g. 0.0.0.0 behind Railway). NextResponse.redirect requires an
  // absolute URL, so construct the same-origin HTTP redirect directly instead.
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/settings?${new URLSearchParams(params)}`,
      'Cache-Control': 'no-store',
    },
  });
}

async function healthHandlerGET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  if (!valid(provider)) return settingsRedirect({ calendar: 'unsupported' });
  const state = url.searchParams.get('state');
  const finish = (response: NextResponse) => {
    response.cookies.set(`calendar-oauth-${provider}`, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: `/api/calendar/oauth/${provider}/callback`, maxAge: 0,
    });
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
  const browserState = new NextRequest(req).cookies.get(`calendar-oauth-${provider}`)?.value;
  let native = false;
  try {
    const code = url.searchParams.get('code');
    if (!state || browserState !== state) throw new Error('Invalid OAuth browser session');
    native = await isNativeOAuthState(state, provider);
    const userId = await verifyOAuthState(state, provider);
    if (!code) throw new Error('Authorization was cancelled');
    const connection = await connectCalendar(provider, userId, code);
    await syncConnection(userId, connection.id);
    return finish(settingsRedirect({ calendar: `${provider}-connected` }, native));
  } catch {
    // Never include provider payloads, codes or credentials in redirect URLs/analytics.
    return finish(settingsRedirect({ calendar: 'error', detail: 'Unable to connect calendar. Please reconnect and allow the requested permissions.' }, native));
  }
}

export const GET = healthRoute('GET /api/calendar/oauth/[provider]/callback', healthHandlerGET);
