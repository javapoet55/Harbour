import { NextResponse } from 'next/server';
import { healthRoute } from '@/server/health/telemetry';
import { cronAuthorized } from '@/server/nutrition/auth';
import { runNutritionTick } from '@/server/nutrition/calls';
import { nutritionCallConfig } from '@/server/nutrition/config';

async function handler(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!nutritionCallConfig().enabled) return NextResponse.json({ error: 'Nutrition calls disabled' }, { status: 503 });
  return NextResponse.json(await runNutritionTick());
}
export const POST = healthRoute('POST /api/nutrition-calls/tick', handler);
