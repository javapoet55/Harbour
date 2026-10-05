import { ZodError } from 'zod';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { MomentError } from '@/server/moments/domain';
import { consumeLimit } from '@/server/signup/abuse';
import { storeLogo, storeLogoInput } from '@/server/shopping/stores';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const input = storeLogoInput.parse({ name: url.searchParams.get('name') ?? '', zip: url.searchParams.get('zip') ?? undefined });
    await consumeLimit('shopping-store-search', user.id, 30, 60_000);
    const logo = await storeLogo(input);
    if (!logo) return new Response(null, { status: 404 });
    return new Response(logo.bytes, { headers: { 'Content-Type': logo.contentType, 'Cache-Control': 'private, max-age=86400' } });
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: 'Enter a store name.' }, { status: 400 });
    if (e instanceof Error && e.message === 'AUTH_RATE_LIMITED') return Response.json({ error: 'Please wait a minute before searching again.' }, { status: 429 });
    if (e instanceof MomentError) return Response.json({ error: e.message }, { status: e.status });
    return jsonError(e);
  }
}
