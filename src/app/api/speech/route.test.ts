import { afterEach, expect, it, vi } from 'vitest';
import { requireUser } from '@/server/auth';
import { POST } from './route';

vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
const request = (text: unknown) => new Request('https://harbour.test/api/speech', {
  method: 'POST', body: JSON.stringify({ text }), headers: { 'Content-Type': 'application/json' },
});

it('requires authentication before calling the speech provider', async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error('UNAUTHENTICATED'));
  const provider = vi.fn(); vi.stubGlobal('fetch', provider);
  expect((await POST(request('Hello'))).status).toBe(401);
  expect(provider).not.toHaveBeenCalled();
});

it('honors disabled spoken replies without calling OpenAI', async () => {
  vi.mocked(requireUser).mockResolvedValue({ preference: { voiceEnabled: false } } as Awaited<ReturnType<typeof requireUser>>);
  const provider = vi.fn(); vi.stubGlobal('fetch', provider);
  expect((await POST(request('Hello'))).status).toBe(403);
  expect(provider).not.toHaveBeenCalled();
});

it('rejects invalid or oversized input without provider usage', async () => {
  const provider = vi.fn(); vi.stubGlobal('fetch', provider);
  for (const text of ['', 12, 'a'.repeat(4001)]) expect((await POST(request(text))).status).toBe(400);
  expect(provider).not.toHaveBeenCalled();
});

it('returns private MP3 audio and sends the key only to OpenAI', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-secret');
  const provider = vi.fn().mockResolvedValue(new Response(new Uint8Array([73, 68, 51])));
  vi.stubGlobal('fetch', provider);
  const result = await POST(request('Hello from Harbour.'));
  expect(result.headers.get('Content-Type')).toBe('audio/mpeg');
  expect(result.headers.get('Cache-Control')).toContain('no-store');
  expect(await result.text()).toBe('ID3');
  const [url, options] = provider.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/audio/speech');
  expect(options.headers.Authorization).toBe('Bearer test-secret');
  expect(JSON.parse(options.body)).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'coral' });
});

it('handles missing credentials and redacts provider errors', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  expect((await POST(request('Hello'))).status).toBe(503);
  vi.stubEnv('OPENAI_API_KEY', 'test-secret');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider detail', { status: 429 })));
  const result = await POST(request('Hello'));
  expect(result.status).toBe(502);
  expect(await result.text()).not.toContain('private provider detail');
});
