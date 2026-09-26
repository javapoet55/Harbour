import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { listPomodoroPage, savePomodoro } from '@/server/pomodoro/sessions';

export async function GET(request: Request) {
  try { const user = await requireUser();
    if (new URL(request.url).searchParams.get('owner') !== user.id) return NextResponse.json({ error: 'Account changed.' }, { status: 403 });
    const cursor = new URL(request.url).searchParams.get('cursor');
    if (cursor && !z.string().uuid().safeParse(cursor).success) return NextResponse.json({ error: 'Invalid history cursor.' }, { status: 400 });
    return NextResponse.json(await listPomodoroPage(user.id, cursor ?? undefined)); }
  catch (error) { return jsonError(error); }
}
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const text = await request.text();
    if (text.length > 4096) return NextResponse.json({ error: 'Session is too large.' }, { status: 400 });
    const payload = JSON.parse(text);
    if (payload?.ownerID !== user.id) return NextResponse.json({ error: 'Account changed.' }, { status: 403 });
    return NextResponse.json({ session: await savePomodoro(user.id, payload.session) });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid focus session.' }, { status: 400 });
    return jsonError(error);
  }
}
