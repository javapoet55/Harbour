import { ZodError } from 'zod';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { MomentError } from '@/server/moments/domain';
import { consumeLimit } from '@/server/signup/abuse';
import { placeID, shoppingStoreHours } from '@/server/shopping/store-hours';
export async function GET(req: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const user = await requireUser();
    const id = placeID.parse(new URL(req.url).searchParams.get('placeId'));
    await consumeLimit('shopping-store-hours', user.id, 20, 60000);
    return Response.json(await shoppingStoreHours(id), { headers });
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: 'Select a store to see its hours.' }, { status: 400, headers });
    if (e instanceof Error && e.message === 'AUTH_RATE_LIMITED') return Response.json({ error: 'Please wait a minute before trying again.' }, { status: 429, headers });
    if (e instanceof MomentError) return Response.json({ error: e.message }, { status: e.status, headers });
    return jsonError(e);
  }
}
