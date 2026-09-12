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
it('issues an expiring task-scoped session using the account timezone', async () => {
  upstream.mockResolvedValue(Response.json({ value: 'ephemeral', expires_at: 123 }));
  const response = await POST(request());
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ value: 'ephemeral', expiresAt: 123, model: 'gpt-realtime-2.1' });
  const payload = JSON.parse(upstream.mock.calls[0][1].body);
  expect(payload.expires_after.seconds).toBe(60);
  expect(payload.session.model).toBe('gpt-realtime-2.1');
  expect(payload.session.audio.input.transcription).toEqual({ model: 'gpt-live-transcribe' });
  expect(payload.session.instructions).toContain('America/Los_Angeles');
  expect(payload.session.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining(['create_task', 'update_task', 'delete_task', 'complete_task', 'find_tasks', 'get_schedule', 'find_free_time', 'prepare_call', 'prepare_email', 'end_session']));
  expect(payload.session.output_modalities).toEqual(['audio']);
  expect(payload.session.audio.input.turn_detection).toMatchObject({ type: 'semantic_vad', interrupt_response: true, create_response: false });
});
it('does not leak upstream errors or secrets', async () => {
  upstream.mockResolvedValue(new Response('server-key private diagnostic', { status: 500 }));
  const response = await POST(request());
  expect(response.status).toBe(502); expect(await response.text()).not.toContain('server-key');
});

it('keeps conversational task sessions on Realtime 2.1 despite legacy model overrides', async () => {
  vi.stubEnv('OPENAI_TASK_REALTIME_MODEL', 'gpt-realtime-mini');
  vi.stubEnv('OPENAI_REALTIME_MODEL', 'gpt-realtime');
  vi.resetModules();
  const { voiceSessionConfiguration, VoiceModelRouter } = await import('@/server/voice/configuration');
  expect(voiceSessionConfiguration('America/Los_Angeles').model).toBe('gpt-realtime-2.1');
  expect(VoiceModelRouter('realtimeConversation')).toBe('gpt-realtime-2.1');
});
