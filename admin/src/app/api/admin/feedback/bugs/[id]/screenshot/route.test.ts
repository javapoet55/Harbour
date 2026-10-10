import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/server/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('@/server/session', () => ({ sessionToken: vi.fn() }));
import { backendFetch } from '@/server/backend';
import { sessionToken } from '@/server/session';
import { GET } from './route';
const request = new Request('https://admin.example.test/api/admin/feedback/bugs/x/screenshot');
const context = { params: Promise.resolve({ id: 'bf35d081-e7ea-4a55-9c97-7078520bc42e' }) };
beforeEach(() => vi.resetAllMocks());
it('requires an admin frontend session', async () => {
  vi.mocked(sessionToken).mockResolvedValue(null);
  expect((await GET(request, context)).headers.get('location')).toBe('https://admin.example.test/login');
  expect(backendFetch).not.toHaveBeenCalled();
});
it('proxies only JPEGs with private caching and the authenticated token', async () => {
  vi.mocked(sessionToken).mockResolvedValue('session');
  vi.mocked(backendFetch).mockResolvedValue(new Response(new Uint8Array([255,216,255]), { headers: { 'Content-Type': 'image/jpeg' } }));
  const response = await GET(request, context);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(backendFetch).toHaveBeenCalledWith(expect.stringContaining('/screenshot'), { token: 'session' });
});
it('does not expose upstream errors or expired screenshot contents', async () => {
  vi.mocked(sessionToken).mockResolvedValue('session');
  vi.mocked(backendFetch).mockResolvedValue(new Response('private internal error', { status: 404 }));
  const response = await GET(request, context);
  expect(response.status).toBe(404); expect(await response.text()).toBe('');
});
