import { nexdoPersonality } from "@/server/assistant-personality";
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user?.preference?.voiceEnabled === false) return Response.json({ error: 'Spoken replies are disabled in Settings.' }, { status: 403 });
    const body = await req.json().catch(() => null);
    if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 4000) {
      return Response.json({ error: 'Speech requires between 1 and 4,000 characters.' }, { status: 400 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ error: 'OpenAI voice is not configured.' }, { status: 503 });
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts', voice: 'coral', input: body.text.trim(),
        instructions: nexdoPersonality,
        response_format: 'mp3',
      }),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(45000)]),
    });
    if (!response.ok) return Response.json({ error: 'OpenAI voice is temporarily unavailable. You can still read the answer.' }, { status: 502 });
    return new Response(await response.arrayBuffer(), {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    return jsonError(err);
  }
}
