import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(req: Request) {
  try {
    await requireUser();
    const consent = await req.json().catch(() => null);
    if (consent?.consent !== true) return Response.json({ error: 'Allow voice sharing before starting.' }, { status: 400, headers });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return Response.json({ error: 'Live transcription is not configured yet. You can still type your question.' }, { status: 503, headers });
    const session = { type: 'transcription', audio: { input: { transcription: { model: 'gpt-live-transcribe' }, turn_detection: { type: 'server_vad', silence_duration_ms: 1800, prefix_padding_ms: 300 } } } };
    const model = 'gpt-live-transcribe';
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(20000)]),
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 60 },
        session,
      }),
    });
    if (!response.ok) return Response.json({ error: 'Couldn’t connect to live transcription. Please try again later.' }, { status: 502, headers });
    const result = await response.json();
    if (typeof result.value !== 'string' || typeof result.expires_at !== 'number') throw new Error('Invalid session');
    return Response.json({ value: result.value, expiresAt: result.expires_at, model }, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return jsonError(error);
    return Response.json({ error: 'Voice connection unavailable. Please try again later.' }, { status: 502, headers });
  }
}
