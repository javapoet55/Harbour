import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  createOAuthState: vi.fn(),
  verifyConnectToken: vi.fn(),
  oauthAuthorizationUrl: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ currentUser: mocks.currentUser }));
vi.mock('@/server/oauth-state', () => ({ createOAuthState: mocks.createOAuthState, verifyConnectToken: mocks.verifyConnectToken }));
vi.mock('@/providers/calendar', () => ({ oauthAuthorizationUrl: mocks.oauthAuthorizationUrl }));

import { GET } from './route';

const origin = 'https://harbour-production-f8a0.up.railway.app';

function start(query = '', provider = 'google') {
  return GET(new Request(`${origin}/api/calendar/oauth/${provider}/start${query}`), {
    params: Promise.resolve({ provider }),
  });
}

describe('calendar OAuth start', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.currentUser.mockResolvedValue(null);
    mocks.createOAuthState.mockResolvedValue('signed-state');
    mocks.verifyConnectToken.mockResolvedValue('user-1');
    mocks.oauthAuthorizationUrl.mockImplementation((provider: string, state: string) => `https://accounts.google.com/o/oauth2/v2/auth?provider=${provider}&state=${state}`);
  });

  it('redirects to the provider for a native connect token without a session cookie', async () => {
    const response = await start('?native=1&connect_token=token-abc');
    expect(mocks.verifyConnectToken).toHaveBeenCalledWith('token-abc', 'google');
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.createOAuthState).toHaveBeenCalledWith('user-1', 'google', true);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('state=signed-state');
  });

  it('still redirects the web path using the session cookie', async () => {
    mocks.currentUser.mockResolvedValue({ id: 'user-web' });
    const response = await start();
    expect(mocks.verifyConnectToken).not.toHaveBeenCalled();
    expect(mocks.createOAuthState).toHaveBeenCalledWith('user-web', 'google', false);
    expect(response.status).toBe(307);
  });

  it('returns 401 JSON, not a blank page, without a cookie or token', async () => {
    const response = await start();
    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
    await expect(response.json()).resolves.toEqual({ error: 'Sign in required.' });
    expect(mocks.oauthAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid or expired connect token', async () => {
    mocks.verifyConnectToken.mockRejectedValue(new Error('Invalid connect token'));
    const response = await start('?native=1&connect_token=stale');
    expect(response.status).toBe(401);
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.oauthAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('rejects a token minted for a different provider', async () => {
    mocks.verifyConnectToken.mockRejectedValue(new Error('Invalid connect token'));
    expect((await start('?connect_token=google-token', 'microsoft')).status).toBe(401);
    expect(mocks.verifyConnectToken).toHaveBeenCalledWith('google-token', 'microsoft');
  });

  it('rejects unsupported providers before any auth work', async () => {
    const response = await start('?connect_token=token-abc', 'unknown');
    expect(response.status).toBe(400);
    expect(mocks.verifyConnectToken).not.toHaveBeenCalled();
  });
});
