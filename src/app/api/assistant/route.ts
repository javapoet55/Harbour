import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { runAssistantTurn } from '@/server/assistant';
import { jsonError } from '@/lib/http';

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const transcript = String(body.transcript ?? '').trim();
    if (!transcript && !body.confirmActionId) {
      return NextResponse.json({ error: 'Say or type something first.' }, { status: 400 });
    }
    const turn = await runAssistantTurn(user.id, transcript || 'yes', body.confirmActionId);
    return NextResponse.json(turn);
  } catch (err) {
    return jsonError(err);
  }
}
