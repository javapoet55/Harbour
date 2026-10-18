import { ZodError } from 'zod';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { MomentError } from '@/server/moments/domain';
import { consumeLimit } from '@/server/signup/abuse';
import { searchShoppingStores, storeSearchInput } from '@/server/shopping/stores';
import { addStoreBrands } from '@/server/shopping/search-brands';
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = storeSearchInput.parse(await req.json());
    await consumeLimit('shopping-store-search', user.id, 30, 60_000);
    const result = await searchShoppingStores(input);
    return Response.json({ stores: await addStoreBrands(result.stores) }, { headers });
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) return Response.json({ error: 'Enter a city or valid ZIP code, or use your location.' }, { status: 400, headers });
    if (e instanceof Error && e.message === 'AUTH_RATE_LIMITED') return Response.json({ error: 'Please wait a minute before searching again.' }, { status: 429, headers });
    if (e instanceof MomentError) return Response.json({ error: e.message }, { status: e.status, headers });
    return jsonError(e);
  }
}
