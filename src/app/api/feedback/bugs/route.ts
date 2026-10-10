import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { consumeLimit } from '@/server/signup/abuse';
import { bugSchema, saveBug } from '@/server/feedback/bugs';
export const runtime = 'nodejs';
// Bound the streamed body too; Content-Length is not trustworthy.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await consumeLimit('bug-report-request', user.id, 30, 3600000);
    const reader = req.body?.getReader();
    if (!reader) return Response.json({ error: 'A report is required.' }, { status: 400 });
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 2_850_000) { await reader.cancel(); return Response.json({ error: 'Screenshot is too large.' }, { status: 413 }); }
      chunks.push(value);
    }
    const parsed = bugSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success) return Response.json({ error: 'Enter a description of 1–2,000 characters and review screenshot consent.' }, { status: 400 });
    const reference = await saveBug(user, parsed.data);
    return Response.json({ reference }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'INVALID_SCREENSHOT')) return Response.json({ error: 'Invalid report or screenshot.' }, { status: 400 });
    if (error instanceof Error && error.message === 'BUG_ID_CONFLICT') return Response.json({ error: 'Report ID is already in use.' }, { status: 409 });
    return jsonError(error);
  }
}
