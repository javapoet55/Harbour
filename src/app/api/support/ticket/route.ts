import { z } from 'zod';
import { takeAiQuota } from '@/server/ai-quota';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { consumeLimit } from '@/server/signup/abuse';
import { healthRoute } from '@/server/health/telemetry';
import { draftTicket, submitTicket } from '@/server/support/tickets';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

const draftInput = z.object({
  action: z.literal('draft'),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2400) }).strict()).min(1).max(12),
}).strict();

/** Signed-in only: draft a ticket with the support assistant, or submit the reviewed ticket. */
async function handler(req: Request) {
  try {
    const user = await requireUser();
    const text = await req.text();
    if (text.length > 40_000) return Response.json({ error: 'Your message is too long.' }, { status: 413, headers });
    const body = JSON.parse(text) as { action?: unknown };
    if (body?.action === 'draft') {
      const parsed = draftInput.safeParse(body);
      if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user' || parsed.data.messages.at(-1)!.content.length > 1000) {
        return Response.json({ error: 'Describe the problem in up to 1,000 characters.' }, { status: 400, headers });
      }
      await consumeLimit('support-ticket-draft', user.id, 40, 3_600_000);
      await takeAiQuota(user, 'support_ticket');
      return Response.json(await draftTicket(parsed.data.messages, req.signal), { headers });
    }
    if (body?.action === 'submit') {
      const { action: _action, ...ticket } = body as Record<string, unknown>;
      void _action;
      const reference = await submitTicket(user, ticket, req.headers.get('user-agent') ?? '');
      return Response.json({ reference }, { headers });
    }
    return Response.json({ error: 'Unknown request.' }, { status: 400, headers });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Please send a valid request.' }, { status: 400, headers });
    if (error instanceof Error && error.message === 'INVALID_TICKET') return Response.json({ error: 'Add a title of up to 120 characters and a description of up to 2,000.' }, { status: 400, headers });
    if (error instanceof Error && error.message === 'BUG_ID_CONFLICT') return Response.json({ error: 'This ticket was already submitted.' }, { status: 409, headers });
    return jsonError(error);
  }
}
export const POST = healthRoute('POST /api/support/ticket', handler);
