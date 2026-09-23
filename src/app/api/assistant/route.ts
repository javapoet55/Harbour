import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { runConversationalAgent } from '@/server/conversational-agent';
import { jsonError } from '@/lib/http';
import { assistantRequestSchema } from '@/lib/executive-contract';
import { detectPolicyViolation, blockedAssistantTurn, sanitizeAssistantOutput } from '@/lib/llm-guard';

async function healthHandlerPOST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = assistantRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { transcript, confirmActionId, rejectActionId, contextActionId } = parsed.data;
    const requestedTranscript = transcript || (rejectActionId ? 'no' : 'yes');
    // A follow-up carries the turn it refers to, so "Why?" reads as a general question on its own and
    // the guard would refuse it. Approvals and rejections are exempt for the same reason. Skipping the
    // guard also lets an unowned contextActionId reach the agent, which answers it with NOT_FOUND
    // rather than a 200 refusal. Output is still sanitized below.
    if (!confirmActionId && !rejectActionId && !contextActionId) {
      const violation = detectPolicyViolation(transcript);
      if (violation) return NextResponse.json({ ...blockedAssistantTurn(requestedTranscript, violation.category), voiceEnabled: user.preference?.voiceEnabled ?? true }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const turn = await runConversationalAgent(user.id, requestedTranscript, confirmActionId, rejectActionId, contextActionId);
    const safeTurn = sanitizeAssistantOutput({ transcript: requestedTranscript, spoken: turn.spoken, visual: turn.visual, confirmation: turn.confirmation, contextActionId: turn.contextActionId, executive: turn.executive });
    return NextResponse.json({ ...safeTurn, voiceEnabled: user.preference?.voiceEnabled ?? true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof Error && err.message === 'CALENDAR_UNAVAILABLE') return NextResponse.json({ error: 'Your calendar could not be refreshed. No task changes were applied. Reconnect or synchronize your calendar, then ask again.' }, { status: 409 });
    if (err instanceof Error && ['STALE_AGENT_PLAN', 'STALE_REPLAN'].includes(err.message)) {
      return NextResponse.json({ error: 'Your tasks, calendar, or available time changed. Please ask again for a fresh plan.' }, { status: 409 });
    }
    if (err instanceof Error && (/OpenAI|structured plan/.test(err.message))) {
      return NextResponse.json({ error: 'The conversational planner is temporarily unavailable. No changes were made.' }, { status: 502 });
    }
    return jsonError(err);
  }
}

export const POST = healthRoute('POST /api/assistant', healthHandlerPOST);
