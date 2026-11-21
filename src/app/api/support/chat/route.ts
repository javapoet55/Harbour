import { z } from 'zod';
import { answerSupport } from '@/server/support/answers';
import { clientAddress, consumeLimit } from '@/server/signup/abuse';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const input = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2400) }).strict()).min(1).max(9) }).strict();
const HOUR = 3_600_000;
const limitFrom = (name: string, fallback: number) => { const value = Number(process.env[name]); return Number.isInteger(value) && value > 0 ? value : fallback; };
/**
 * Public, so it is capped two ways, in one-hour windows kept in the shared database (every server instance sees the
 * same counts and a restart does not reset them): questions from one address (SUPPORT_CHAT_IP_HOURLY_LIMIT,
 * default 10) and questions from everyone together (SUPPORT_CHAT_GLOBAL_HOURLY_LIMIT, default 10). The address
 * is read only from the header our own ingress sets (AUTH_TRUSTED_IP_HEADER), never from X-Forwarded-For,
 * which a caller can write. Anything that cannot be counted is refused, not allowed.
 */
async function takeQuestion(req: Request) {
  const address = clientAddress(req);
  await consumeLimit('support-chat-ip', address, limitFrom('SUPPORT_CHAT_IP_HOURLY_LIMIT', 10), HOUR);
  await consumeLimit('support-chat-global', 'all', limitFrom('SUPPORT_CHAT_GLOBAL_HOURLY_LIMIT', 10), HOUR);
}
// Concurrency guard for this instance only; it protects the server, it is not the quota.
let active = 0;
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
  if (active >= 5) return Response.json({ error: 'Support chat is busy. Please try again in a minute.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  try { await takeQuestion(req); }
  catch (error) {
    if (error instanceof Error && error.message === 'AUTH_RATE_LIMITED') {
      return Response.json({ error: 'You’ve reached the limit for support questions this hour. Please try again later, or email support@nexdoapp.com.' }, { status: 429, headers: { ...headers, 'Retry-After': '3600' } });
    }
    return Response.json({ error: 'Support chat is temporarily unavailable. Please email support@nexdoapp.com.' }, { status: 503, headers });
  }
  active++;
  try { return Response.json(await answerSupport(parsed.data.messages, req.signal), { headers }); }
  finally { active--; }
}
