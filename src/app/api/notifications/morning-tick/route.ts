import { timingSafeEqual } from 'node:crypto';
import { runMorningSummaries } from '@/server/morning-summary';
export async function POST(req: Request) {
  const secret = process.env.HARBOR_CRON_SECRET;
  const supplied = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json(await runMorningSummaries(), { headers: { 'Cache-Control': 'no-store' } });
}
