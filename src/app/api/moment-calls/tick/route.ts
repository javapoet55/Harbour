import { NextResponse } from 'next/server';
import { healthRoute } from '@/server/health/telemetry';
import { cronAuthorized } from '@/server/nutrition/auth';
import { momentCallsConfig, runMomentCallTick } from '@/server/moment-calls/service';

async function handler(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!momentCallsConfig().available) return NextResponse.json({ error: 'Moment calls disabled' }, { status: 503 });
  return NextResponse.json(await runMomentCallTick());
}
export const POST = healthRoute('POST /api/moment-calls/tick', handler);
