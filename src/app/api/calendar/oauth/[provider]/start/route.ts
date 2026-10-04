import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { currentUser } from '@/server/auth';
import { withUser } from '@/lib/http';
import { createOAuthState, verifyConnectToken } from '@/server/oauth-state';
import { oauthAuthorizationUrl, type OAuthProvider } from '@/providers/calendar';

function valid(value: string): value is OAuthProvider { return value === 'google' || value === 'microsoft'; }

async function healthHandlerGET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  return withUser(async () => {
    const { provider } = await ctx.params;
    if (!valid(provider)) return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 });
    const params = new URL(req.url).searchParams;
    const native = params.get('native') === '1';
    // The web path keeps using the session cookie. Native clients present a
    // short-lived connect token issued by an authenticated API call instead.
    const connectToken = params.get('connect_token');
    const userId = connectToken
      ? await verifyConnectToken(connectToken, provider).catch(() => null)
      : (await currentUser())?.id ?? null;
    if (!userId) throw new Error('UNAUTHENTICATED');
    const state = await createOAuthState(userId, provider, native);
    const response = NextResponse.redirect(oauthAuthorizationUrl(provider, state));
    // Bind the callback to the browser that initiated it, including native ASWebAuthenticationSession.
    response.cookies.set(`calendar-oauth-${provider}`, state, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: `/api/calendar/oauth/${provider}/callback`, maxAge: 600,
    });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  });
}

export const GET = healthRoute('GET /api/calendar/oauth/[provider]/start', healthHandlerGET);
