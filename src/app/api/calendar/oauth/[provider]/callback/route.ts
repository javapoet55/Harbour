import { NextResponse } from 'next/server';
import { connectCalendar, type OAuthProvider } from '@/providers/calendar';
import { verifyOAuthState } from '@/server/oauth-state';
import { syncConnection } from '@/server/calendar-sync';

function valid(value: string): value is OAuthProvider { return value === 'google' || value === 'microsoft'; }

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  if (!valid(provider)) return NextResponse.redirect(new URL('/settings?calendar=unsupported', url));
  try {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) throw new Error(url.searchParams.get('error_description') || 'Authorization was cancelled');
    const userId = await verifyOAuthState(state, provider);
    const connection = await connectCalendar(provider, userId, code);
    await syncConnection(userId, connection.id);
    return NextResponse.redirect(new URL(`/settings?calendar=${provider}-connected`, url));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth failed';
    return NextResponse.redirect(new URL(`/settings?calendar=error&detail=${encodeURIComponent(message.slice(0, 120))}`, url));
  }
}
