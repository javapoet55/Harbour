import { createHash } from 'node:crypto';
import { z } from 'zod';
import { answerSupport } from '@/server/support/answers';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const input = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2400) }).strict()).min(1).max(9) }).strict();
// Bounded per-process protection, plus a global cap that cannot be bypassed by spoofing IPs.
const visitors = new Map<string, { count: number; expires: number }>();
let windowStart = 0, count = 0, active = 0;
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  let sameHost = true;
  try { sameHost = !origin || (['http:', 'https:'].includes(new URL(origin).protocol) && new URL(origin).host === (req.headers.get('host') || new URL(req.url).host)); } catch { sameHost = false; }
  if (!sameHost || req.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Please use the chat on Nexdo’s website.' }, { status: 403, headers });
  if (!req.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'Expected a JSON request.' }, { status: 415, headers });
  let parsed;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error('Missing body');
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16000) { await reader.cancel(); return Response.json({ error: 'Your message is too long.' }, { status: 413, headers }); } chunks.push(value); }
    parsed = input.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch { return Response.json({ error: 'Please send a valid question.' }, { status: 400, headers }); }
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user' || parsed.data.messages.at(-1)!.content.length > 1000) return Response.json({ error: 'Ask a question of up to 1,000 characters.' }, { status: 400, headers });
  const now = Date.now();
  if (now - windowStart >= 60000) { windowStart = now; count = 0; }
  for (const [key, value] of visitors) if (value.expires <= now) visitors.delete(key);
  const key = createHash('sha256').update(req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown').digest('hex');
  const visitor = visitors.get(key) ?? { count: 0, expires: now + 60000 };
  if (count >= 60 || active >= 5 || visitor.count >= 10) return Response.json({ error: 'Please wait a minute before sending another question.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  visitor.count++; visitors.set(key, visitor); count++; active++;
  try { return Response.json(await answerSupport(parsed.data.messages, req.signal), { headers }); }
  finally { active--; }
}
