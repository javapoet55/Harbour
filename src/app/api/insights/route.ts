import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { buildPersonalizedInsights, erasePersonalizationData } from '@/server/predictions';
import { jsonError } from '@/lib/http';

async function healthHandlerGET() {
  try { const user = await requireUser(); return NextResponse.json(await buildPersonalizedInsights(user.id)); }
  catch (error) { return jsonError(error); }
}

async function healthHandlerDELETE() {
  try { const user = await requireUser(); await erasePersonalizationData(user.id); return NextResponse.json({ ok: true }); }
  catch (error) { return jsonError(error); }
}

export const GET = healthRoute('GET /api/insights', healthHandlerGET);

export const DELETE = healthRoute('DELETE /api/insights', healthHandlerDELETE);
