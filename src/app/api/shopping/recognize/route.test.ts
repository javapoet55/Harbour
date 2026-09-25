import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { POST } from './route';
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/server/auth', () => auth);
const upstream = vi.fn();
const request = (overrides = {}) => new Request('https://test/api/shopping/recognize', { method: 'POST', body: JSON.stringify({ imageData: '/9j/AA==', consent: true, ...overrides }) });
const result = { name: 'Whole Milk', brand: 'Example Dairy', category: 'Dairy & Eggs', confidence: 'high' };
const answer = (value = result) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
beforeEach(() => { auth.requireUser.mockResolvedValue({ id: crypto.randomUUID() }); upstream.mockReset(); vi.stubGlobal('fetch', upstream); vi.stubEnv('OPENAI_API_KEY', 'secret'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('requires authentication and permission before sending photos', async () => {
  expect((await POST(request({ consent: false }))).status).toBe(400);
  auth.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await POST(request())).status).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
});
it('rejects invalid and oversized images without calling AI', async () => {
  expect((await POST(request({ imageData: 'https://example.com/photo' }))).status).toBe(400);
  expect((await POST(request({ imageData: 'a'.repeat(93000) }))).status).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});
it('returns editable product details and sends a non-stored image request', async () => {
  upstream.mockResolvedValue(answer());
  const response = await POST(request());
  expect(response.status).toBe(200); expect(await response.json()).toEqual(result);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  const body = JSON.parse(upstream.mock.calls[0][1].body);
  expect(body.store).toBe(false);
  expect(body.input[0].content[0].image_url).toBe('data:image/jpeg;base64,/9j/AA==');
});
it('accepts a generic item without inventing a brand', async () => {
  upstream.mockResolvedValue(answer({ ...result, name: 'Mango', brand: '', category: 'Produce', confidence: 'medium' }));
  expect(await (await POST(request())).json()).toMatchObject({ name: 'Mango', brand: '' });
});
it('does not autofill ambiguous photos', async () => {
  upstream.mockResolvedValue(answer({ ...result, confidence: 'low' }));
  expect((await POST(request())).status).toBe(422);
});
it('rejects invalid provider fields and incomplete or refused responses', async () => {
  upstream.mockResolvedValueOnce(answer({ ...result, category: 'Invented' }))
    .mockResolvedValueOnce(Response.json({ status: 'incomplete', output: [] }))
    .mockResolvedValueOnce(Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }));
  for (let i = 0; i < 3; i++) expect((await POST(request())).status).toBe(502);
});
it('handles unconfigured service and hides provider diagnostics', async () => {
  vi.stubEnv('OPENAI_API_KEY', ''); expect((await POST(request())).status).toBe(503);
  vi.stubEnv('OPENAI_API_KEY', 'secret'); upstream.mockResolvedValue(new Response('secret diagnostics', { status: 500 }));
  const response = await POST(request()); expect(response.status).toBe(502); expect(await response.text()).not.toContain('secret');
});
it('bounds repeated requests and releases the busy flag after failures', async () => {
  upstream.mockRejectedValue(new Error('timeout'));
  for (let i = 0; i < 30; i++) expect((await POST(request())).status).toBe(502);
  expect((await POST(request())).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(30);
});
it('rejects concurrent recognition for the same user', async () => {
  let finish!: (response: Response) => void;
  upstream.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  const first = POST(request());
  await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1));
  expect((await POST(request())).status).toBe(429);
  finish(answer());
  expect((await first).status).toBe(200);
});
