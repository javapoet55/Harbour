import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { log } from '@/lib/logger';
import { MomentError } from '@/server/moments/domain';
import { CARD_MAX_BYTES, deleteCardImage, readCardImage, saveCardImage } from '@/server/moments/card-image';

type Context = { params: Promise<{ id: string }> };
function failure(e: unknown) {
  if (e instanceof MomentError) return NextResponse.json({ error: e.message }, { status: e.status });
  // The Prisma error code only (e.g. P1008): never the message, which can quote row data.
  const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
  if (/^P\d{4}$/.test(code)) log('error', 'card.database_error', { code });
  return jsonError(e);
}
const tooLarge = () => new MomentError('The card image is too large. Save it at a smaller size (1.5 MB at most).', 413);

/**
 * The body is the image itself (`Content-Type: image/jpeg` or `image/png`), or JSON `{ "data": "<base64>" }`
 * for clients whose API layer only sends JSON. The type is read from the bytes, not the header.
 */
async function cardBytes(req: Request) {
  const json = (req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json');
  const limit = json ? Math.ceil(CARD_MAX_BYTES / 3) * 4 + 1024 : CARD_MAX_BYTES;
  if (Number(req.headers.get('content-length') ?? 0) > limit) throw tooLarge();
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.length > limit) throw tooLarge();
  if (!json) return raw;
  let data: unknown;
  try { data = (JSON.parse(new TextDecoder().decode(raw)) as { data?: unknown }).data; }
  catch { throw new MomentError('Invalid JSON request.'); }
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new MomentError('Send the card as base64 in "data".');
  return new Uint8Array(Buffer.from(data, 'base64'));
}

async function healthHandlerPUT(req: Request, ctx: Context) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    return NextResponse.json(await saveCardImage(user.id, id, await cardBytes(req)));
  } catch (e) { return failure(e); }
}

async function healthHandlerGET(req: Request, ctx: Context) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const card = await readCardImage(user.id, id);
    const headers = { ETag: `"${card.sha256}"`, 'Cache-Control': 'private, no-cache' };
    if (req.headers.get('if-none-match') === headers.ETag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(card.bytes), { headers: { ...headers, 'Content-Type': card.mime, 'Content-Length': String(card.size), 'X-Card-Id': card.id } });
  } catch (e) { return failure(e); }
}

async function healthHandlerDELETE(_req: Request, ctx: Context) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    return NextResponse.json(await deleteCardImage(user.id, id));
  } catch (e) { return failure(e); }
}

export const PUT = healthRoute('PUT /api/moments/[id]/card', healthHandlerPUT);

export const POST = healthRoute('POST /api/moments/[id]/card', healthHandlerPUT);

export const GET = healthRoute('GET /api/moments/[id]/card', healthHandlerGET);

export const DELETE = healthRoute('DELETE /api/moments/[id]/card', healthHandlerDELETE);
