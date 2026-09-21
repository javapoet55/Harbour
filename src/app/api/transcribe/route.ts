import { observedFetch } from '@/server/health/telemetry';
import { healthRoute } from '@/server/health/telemetry';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const failure = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });

/** Bound streamed uploads too; Content-Length alone is not a trustworthy limit. */
async function readAudio(req: Request): Promise<Blob | null> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data;') || !req.body) return null;
  if (Number(req.headers.get('content-length')) > MAX_BODY_BYTES) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const form = await new Response(bytes, { headers: { 'Content-Type': type } }).formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob) || !['audio/mp4', 'audio/m4a', 'audio/x-m4a'].includes(file.type) || !file.size || file.size > MAX_AUDIO_BYTES) return null;
  return file;
}

async function healthHandlerPOST(req: Request) {
  try { await requireUser(); } catch (err) { return jsonError(err); }
  try {
    const audio = await readAudio(req);
    if (!audio) return failure('Record a short voice message of up to two minutes.', 400);
    const key = process.env.OPENAI_API_KEY;
    if (!key) return failure('Voice transcription is not configured yet. You can still type your request.', 503);
    const form = new FormData();
    form.set('file', audio, 'voice.m4a');
    form.set('model', 'gpt-4o-mini-transcribe');
    form.set('response_format', 'json');
    const response = await observedFetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(45000)]),
    });
    if (!response.ok) return failure('Voice transcription is temporarily unavailable. Please try again.', 502);
    const result: unknown = await response.json();
    const text = result && typeof result === 'object' && 'text' in result && typeof result.text === 'string' ? result.text.trim() : '';
    if (!text) return failure('No speech was recognized. Please record your request again.', 422);
    if (text.length > 4000) return failure('Please record a shorter request.', 422);
    // Audio is forwarded in memory, never stored or included in logs.
    return Response.json({ text }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return failure('Couldn’t transcribe your recording. Please try again.', 502);
  }
}

export const POST = healthRoute('POST /api/transcribe', healthHandlerPOST);
