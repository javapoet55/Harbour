import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { buildPersonalizedInsights, erasePersonalizationData } from '@/server/predictions';
import { jsonError } from '@/lib/http';

export async function GET() {
  try { const user = await requireUser(); return NextResponse.json(await buildPersonalizedInsights(user.id)); }
  catch (error) { return jsonError(error); }
}

export async function DELETE() {
  try { const user = await requireUser(); await erasePersonalizationData(user.id); return NextResponse.json({ ok: true }); }
  catch (error) { return jsonError(error); }
}
