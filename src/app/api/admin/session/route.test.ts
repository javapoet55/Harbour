import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ after: vi.fn(), requestAdminCodeApi: vi.fn() }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: mocks.after }));
vi.mock('@/server/admin-session', () => ({ adminClientAuthorized: () => true, adminBearerToken: () => null }));
vi.mock('@/server/admin-api-session', () => ({ requestAdminCodeApi: mocks.requestAdminCodeApi, verifyAdminCodeApi: vi.fn() }));
import { POST } from './route';

const request = () => POST(new Request('http://backend.test/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Client-IP': '192.0.2.1' }, body: JSON.stringify({ action: 'request', email: 'admin@nexdo.test' }) }));
beforeEach(() => { mocks.after.mockReset(); mocks.requestAdminCodeApi.mockReset(); });

it('hands the email send to after() so Next keeps it running after the response', async () => {
  let finish!: () => void;
  const delivery = new Promise<void>((resolve) => { finish = resolve; });
  mocks.requestAdminCodeApi.mockResolvedValue({ delivery });
  const response = await request();
  expect(response.status).toBe(200);
  expect(mocks.requestAdminCodeApi).toHaveBeenCalledWith('admin@nexdo.test', '192.0.2.1');
  expect(mocks.after).toHaveBeenCalledWith(delivery);
  finish();
});

it('still answers, and lets the send finish, where after() is unavailable', async () => {
  mocks.after.mockImplementation(() => { throw new Error('`after` was called outside a request scope'); });
  let finished = false;
  mocks.requestAdminCodeApi.mockResolvedValue({ delivery: Promise.resolve().then(() => { finished = true; }) });
  expect((await request()).status).toBe(200);
  await vi.waitFor(() => expect(finished).toBe(true));
});
