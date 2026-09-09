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

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  if (!valid(provider)) return settingsRedirect({ calendar: 'unsupported' });
  const state = url.searchParams.get('state');
  try {
    const code = url.searchParams.get('code');
    if (!code || !state) throw new Error(url.searchParams.get('error_description') || 'Authorization was cancelled');
    const native = await isNativeOAuthState(state, provider);
    const userId = await verifyOAuthState(state, provider);
    const connection = await connectCalendar(provider, userId, code);
    await syncConnection(userId, connection.id);
    return settingsRedirect({ calendar: `${provider}-connected` }, native);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth failed';
    const native = state ? await isNativeOAuthState(state, provider).catch(() => false) : false;
    return settingsRedirect({ calendar: 'error', detail: message.slice(0, 120) }, native);
  }
}
