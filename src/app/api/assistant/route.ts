import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { runConversationalAgent } from '@/server/conversational-agent';
import { jsonError } from '@/lib/http';

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const transcript = String(body.transcript ?? '').trim();
    if (!transcript && !body.confirmActionId) {
      return NextResponse.json({ error: 'Say or type something first.' }, { status: 400 });
    }
    const turn = await runConversationalAgent(user.id, transcript || 'yes', body.confirmActionId);
    return NextResponse.json(turn);
  } catch (err) {
    if (err instanceof Error && err.message === 'STALE_AGENT_PLAN') {
      return NextResponse.json({ error: 'The referenced tasks changed. Please ask again so I can build a fresh plan.' }, { status: 409 });
    }
    if (err instanceof Error && (/OpenAI|structured plan/.test(err.message))) {
      return NextResponse.json({ error: 'The conversational planner is temporarily unavailable. No changes were made.' }, { status: 502 });
    }
    return jsonError(err);
  }
}
