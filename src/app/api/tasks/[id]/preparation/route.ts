import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { loadPreparation, savePreparation } from '@/server/follow-up';
import { ZodError } from 'zod';
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Context) {
  try { const user = await requireUser(); return NextResponse.json(await loadPreparation(user.id, (await ctx.params).id)); }
  catch (error) { return jsonError(error); }
}
export async function PUT(req: Request, ctx: Context) {
  try {
    const user = await requireUser();
    return NextResponse.json(await savePreparation(user.id, (await ctx.params).id, await req.json()));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Check the preparation fields and try again.' }, { status: 400 });
    if (error instanceof Error && (error.message === 'FOLLOW_UP_CHANGED' || ('code' in error && error.code === 'P2002'))) return NextResponse.json({ error: 'This preparation changed on another device. Reopen it before saving.' }, { status: 409 });
    return jsonError(error);
  }
}
