import type { NextRequest } from 'next/server';
import { healthActionSchema, healthRanges, healthSchema, okSchema } from '@/contract/health';
import { json, proxyToBackend } from '@/server/proxy';
import { sameOrigin } from '@/server/request';

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get('range') ?? '24H';
  if (!(healthRanges as readonly string[]).includes(range)) return json({ error: 'Invalid time range' }, 400);
  return proxyToBackend(request, `/api/admin/health?range=${range}`, healthSchema);
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Request not allowed' }, 403);
  const parsed = healthActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid action' }, 400);
  return proxyToBackend(request, '/api/admin/health', okSchema, { method: 'POST', body: parsed.data });
}
