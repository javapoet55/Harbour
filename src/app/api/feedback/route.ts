import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { jsonError } from '@/lib/http';
import { healthRoute } from '@/server/health/telemetry';
const schema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(5000), stars: z.number().int().min(1).max(5) });
async function submit(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a title, description, and a rating from 1 to 5 stars.' }, { status: 400 });
    // The client retains this ID when retrying a request whose response was lost.
    const saved = await prisma.feedback.upsert({ where: { id: parsed.data.id }, create: { ...parsed.data, userId: user.id, customerName: user.name }, update: {} });
    if (!saved || saved.userId !== user.id) return NextResponse.json({ error: 'Could not submit this feedback. Please reopen the form and try again.' }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
export const POST = healthRoute('POST /api/feedback', submit);
