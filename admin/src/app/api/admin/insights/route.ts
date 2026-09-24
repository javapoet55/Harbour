import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminAnswerSchema } from '@/contract/insights';
import { INSIGHTS_TIMEOUT_MS } from '@/server/backend';
import { json, proxyToBackend } from '@/server/proxy';
import { sameOrigin } from '@/server/request';

// Shape check only; the backend validates the range and owns the detailed messages.
const question = z.object({
  question: z.string().trim().min(3, 'Enter a question about Nexdo usage.').max(600, 'Keep the question under 600 characters.'),
  days: z.number().int().min(1).max(366),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
}).strict();

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Request not allowed.' }, 403);
  const parsed = question.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid question.' }, 400);
  return proxyToBackend(request, '/api/admin/insights', adminAnswerSchema, { method: 'POST', body: parsed.data, timeoutMs: INSIGHTS_TIMEOUT_MS });
}
