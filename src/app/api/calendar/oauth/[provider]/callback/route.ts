import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
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

/**
 * The value of `name` in a `Cookie` header, or undefined when it is not there.
 *
 * Deliberately NOT `new NextRequest(req).cookies.get(name)`. Re-wrapping the incoming request throws
 * on Next 16 in production -- "Cannot read private member #state from an object whose class did not
 * declare it" -- because the request the server hands the route is not constructible by the `Request`
 * this module closes over. Every Google and Outlook connect answered 500 that way (Railway, 2026-10-06
 * 10:00 UTC). The route tests passed a plain `Request`, which re-wraps fine, so they never saw it.
 *
 * Matches `RequestCookies.get`, so the state comparison below is unchanged: split on `;`, drop leading
 * spaces, the first `=` separates name from value (a bare name reads as "true"), trailing spaces come
 * off the value, the value is percent-decoded, and a repeated name takes its last value. The OAuth
 * state is a compact JWS, so none of the decoding applies to it in practice.
 */
function cookieValue(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  let value: string | undefined;
  for (const pair of header.split(';')) {
    const entry = pair.replace(/^\s+/, '');
    const separator = entry.indexOf('=');
    if ((separator === -1 ? entry.trim() : entry.slice(0, separator)) !== name) continue;
    const raw = separator === -1 ? 'true' : entry.slice(separator + 1).replace(/\s+$/, '');
    // A value that is not valid percent-encoding is dropped rather than kept raw, so it can neither
    // satisfy the comparison below nor hide an earlier, well-formed cookie of the same name.
    try { value = decodeURIComponent(raw); } catch { /* skip this pair */ }
  }
  return value;
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
  let native = false;
  try {
    // Inside the try: a failure reading the cookie now returns the Settings redirect below, never a 500.
    const browserState = cookieValue(req.headers.get('cookie'), `calendar-oauth-${provider}`);
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
