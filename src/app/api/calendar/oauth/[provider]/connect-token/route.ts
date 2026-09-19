import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { withUser } from '@/lib/http';
import { createConnectToken } from '@/server/oauth-state';
import type { OAuthProvider } from '@/providers/calendar';

function valid(value: string): value is OAuthProvider { return value === 'google' || value === 'microsoft'; }

// Issues a short-lived token the native app hands to the OAuth start route,
// which runs in ASWebAuthenticationSession and cannot send the session cookie.
export async function POST(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  return withUser(async () => {
    const user = await requireUser();
    const { provider } = await ctx.params;
    if (!valid(provider)) return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 });
    return NextResponse.json(
      { token: await createConnectToken(user.id, provider) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
