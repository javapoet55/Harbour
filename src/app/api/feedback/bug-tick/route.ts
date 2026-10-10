import { timingSafeEqual } from 'node:crypto';
import { maintainBugReports } from '@/server/feedback/bugs';
export async function POST(req: Request) {
  const key = process.env.HARBOR_CRON_SECRET;
  const supplied = req.headers.get('authorization') ?? '';
  if (!key || Buffer.byteLength(supplied) !== Buffer.byteLength(`Bearer ${key}`) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${key}`))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try { return Response.json(await maintainBugReports(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Report delivery unavailable' }, { status: 503 }); }
}
