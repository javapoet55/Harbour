import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { createOAuthState } from '@/server/oauth-state';
import { oauthAuthorizationUrl, type OAuthProvider } from '@/providers/calendar';

function valid(value: string): value is OAuthProvider { return value === 'google' || value === 'microsoft'; }

export async function GET(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const user = await requireUser();
  const { provider } = await ctx.params;
  if (!valid(provider)) return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 });
  const native = new URL(_req.url).searchParams.get('native') === '1';
  return NextResponse.redirect(oauthAuthorizationUrl(provider, await createOAuthState(user.id, provider, native)));
}
