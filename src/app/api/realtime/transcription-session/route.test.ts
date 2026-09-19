import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/server/auth', () => auth);
const upstream = vi.fn();
const request = (consent = true) => new Request('https://nexdo.test/api/realtime/task-session', { method: 'POST', body: JSON.stringify({ consent }) });
beforeEach(() => {
  auth.requireUser.mockReset().mockResolvedValue({ id: 'voice-user', timeZone: 'America/Los_Angeles' });
  upstream.mockReset(); vi.stubGlobal('fetch', upstream); vi.stubEnv('OPENAI_API_KEY', 'server-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('requires login before requesting a paid session', async () => {
  auth.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await POST(request())).status).toBe(401); expect(upstream).not.toHaveBeenCalled();
});
it('requires voice consent', async () => {
  expect((await POST(request(false))).status).toBe(400); expect(upstream).not.toHaveBeenCalled();
});
it('returns a configured error when no server key exists', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  expect((await POST(request())).status).toBe(503); expect(upstream).not.toHaveBeenCalled();
});
it('issues an expiring continuous transcription session with a VAD-compatible model', async () => {
  upstream.mockResolvedValue(Response.json({ value: 'ephemeral', expires_at: 123 }));
  const response = await POST(request());
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ value: 'ephemeral', expiresAt: 123, model: 'gpt-4o-transcribe' });
  const payload = JSON.parse(upstream.mock.calls[0][1].body);
  expect(payload.expires_after.seconds).toBe(60);
  expect(payload.session.type).toBe('transcription');
  expect(payload.session.tools).toBeUndefined();
  expect(payload.session.audio.input.turn_detection).toEqual({ type: 'server_vad', silence_duration_ms: 1800, prefix_padding_ms: 300 });
  expect(payload.session.model).toBeUndefined();
  expect(payload.session.audio.input.transcription).toEqual({ model: 'gpt-4o-transcribe' });
});
it('does not leak upstream errors or secrets', async () => {
  upstream.mockResolvedValue(new Response('server-key private diagnostic', { status: 500 }));
  const response = await POST(request());
  expect(response.status).toBe(502); expect(await response.text()).not.toContain('server-key');
});

