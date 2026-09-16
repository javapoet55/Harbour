import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createConnectToken: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/oauth-state', () => ({ createConnectToken: mocks.createConnectToken }));

import { POST } from './route';

const origin = 'https://harbour-production-f8a0.up.railway.app';

function issue(provider = 'google') {
  return POST(new Request(`${origin}/api/calendar/oauth/${provider}/connect-token`, { method: 'POST' }), {
    params: Promise.resolve({ provider }),
  });
}

describe('calendar connect token', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUser.mockResolvedValue({ id: 'user-1' });
    mocks.createConnectToken.mockResolvedValue('token-abc');
  });

  it('issues a token for the signed-in user', async () => {
    const response = await issue();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ token: 'token-abc' });
    expect(mocks.createConnectToken).toHaveBeenCalledWith('user-1', 'google');
  });

  it('requires a session', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const response = await issue();
    expect(response.status).toBe(401);
    expect(mocks.createConnectToken).not.toHaveBeenCalled();
  });

  it('rejects unsupported providers', async () => {
    expect((await issue('unknown')).status).toBe(400);
    expect(mocks.createConnectToken).not.toHaveBeenCalled();
  });
});
