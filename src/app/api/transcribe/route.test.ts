import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requireUser } from '@/server/auth';
import { POST } from './route';

vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
beforeEach(() => {
  vi.mocked(requireUser).mockResolvedValue({ id: 'voice-user' } as Awaited<ReturnType<typeof requireUser>>);
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
const request = (audio = new Blob(['recording'], { type: 'audio/mp4' })) => {
  const body = new FormData(); body.set('file', audio, 'clip.m4a');
  return new Request('https://harbour.test/api/transcribe', { method: 'POST', body });
};

it('authenticates before reading or sending audio', async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error('UNAUTHENTICATED'));
  const provider = vi.fn(); vi.stubGlobal('fetch', provider);
  const req = request();
  expect((await POST(req)).status).toBe(401);
  expect(req.bodyUsed).toBe(false);
  expect(provider).not.toHaveBeenCalled();
});

it('forwards an authenticated M4A to OpenAI and returns only trimmed text', async () => {
  const provider = vi.fn().mockResolvedValue(Response.json({ text: ' Create a task to buy groceries tomorrow. ', other: 'private' }));
  vi.stubGlobal('fetch', provider);
  const result = await POST(request());
  expect(await result.json()).toEqual({ text: 'Create a task to buy groceries tomorrow.' });
  expect(result.headers.get('Cache-Control')).toBe('private, no-store');
  const [url, options] = provider.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
  expect(options.headers).toEqual({ Authorization: 'Bearer test-key' });
  expect(options.body.get('model')).toBe('gpt-4o-mini-transcribe');
  expect(options.body.get('response_format')).toBe('json');
  expect(await options.body.get('file').text()).toBe('recording');
});

it('rejects empty, wrong-format, malformed, and oversized uploads before provider usage', async () => {
  const provider = vi.fn(); vi.stubGlobal('fetch', provider);
  for (const req of [
    request(new Blob([], { type: 'audio/mp4' })),
    request(new Blob(['text'], { type: 'text/plain' })),
    request(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'audio/mp4' })),
    new Request('https://harbour.test/api/transcribe', { method: 'POST', body: 'bad body', headers: { 'Content-Type': 'multipart/form-data; boundary=missing' } }),
    new Request('https://harbour.test/api/transcribe', { method: 'POST', body: '{}' }),
  ]) expect((await POST(req)).status).toBe(400);
  expect(provider).not.toHaveBeenCalled();
});

it('limits chunked uploads even without Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  });
  const req = new Request('https://harbour.test/api/transcribe', {
    method: 'POST', body: stream, duplex: 'half', headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
  } as RequestInit);
  const provider = vi.fn(); vi.stubGlobal('fetch', provider);
  expect((await POST(req)).status).toBe(400);
  expect(cancelled).toBe(true);
  expect(provider).not.toHaveBeenCalled();
});

it('handles unavailable configuration and hides provider failures', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  const provider = vi.fn(); vi.stubGlobal('fetch', provider);
  expect((await POST(request())).status).toBe(503);
  expect(provider).not.toHaveBeenCalled();
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  provider.mockResolvedValue(new Response('private provider error', { status: 429 }));
  const failed = await POST(request());
  expect(failed.status).toBe(502);
  expect(await failed.text()).not.toContain('private provider error');
  provider.mockRejectedValue(new Error('private network failure'));
  expect((await POST(request())).status).toBe(502);
});

it('rejects silence, malformed output, and transcripts too long for the assistant', async () => {
  for (const output of [{ text: '  ' }, { text: 42 }, { text: 'a'.repeat(4001) }]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(output)));
    expect((await POST(request())).status).toBe(422);
  }
});
