import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const origin = 'https://app.nexdoapp.com';

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
    expect(response.headers.get('set-cookie')).toContain('calendar-oauth-google=signed-state');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
    expect(response.headers.get('cache-control')).toBe('no-store');
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

describe('calendar OAuth start: unverified-app notice', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    mocks.currentUser.mockResolvedValue({ id: 'user-web' });
    mocks.createOAuthState.mockResolvedValue('signed-state');
    mocks.verifyConnectToken.mockResolvedValue('user-1');
    mocks.oauthAuthorizationUrl.mockImplementation((provider: string, state: string) => `https://accounts.google.com/o/oauth2/v2/auth?provider=${provider}&state=${state}`);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  const continueHref = (body: string) => body.match(/class="primary" href="([^"]*)"/)?.[1].replace(/&amp;/g, '&') ?? '';
  const cancelHref = (body: string) => body.match(/class="secondary" href="([^"]*)"/)?.[1].replace(/&amp;/g, '&') ?? '';

  it('flag off: Google redirects and sets the state cookie as before', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', '');
    const response = await start();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(response.headers.get('set-cookie')).toContain('calendar-oauth-google=signed-state');
  });

  it('only the exact value "true" turns the notice on', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', 'TRUE');
    expect((await start()).status).toBe(307);
  });

  it('flag on, no ack: returns the notice page without starting OAuth', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', 'true');
    const response = await start();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(mocks.createOAuthState).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).toContain('Advanced');
    expect(body).toContain('connect your Google Calendar');
    expect(body).not.toContain('<script');
    expect(continueHref(body)).toBe('/api/calendar/oauth/google/start?ack=1');
    expect(cancelHref(body)).toBe('/settings');
  });

  it('flag on, ack=1: redirects and sets the cookie as before', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', 'true');
    const response = await start('?ack=1');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('state=signed-state');
    expect(response.headers.get('set-cookie')).toContain('calendar-oauth-google=signed-state');
  });

  it('flag on, Microsoft: no notice', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', 'true');
    const response = await start('', 'microsoft');
    expect(response.status).toBe(307);
    expect(response.headers.get('set-cookie')).toContain('calendar-oauth-microsoft=signed-state');
  });

  it('flag on, unauthenticated: the same 401 as today', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', 'true');
    mocks.currentUser.mockResolvedValue(null);
    const response = await start();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Sign in required.' });
  });

  it('keeps native=1 and connect_token in Continue and echoes nothing else', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', 'true');
    const response = await start('?native=1&connect_token=token-abc&evil=%22%3E%3Cscript%3E&redirect=https://x.test');
    expect(response.status).toBe(200);
    const body = await response.text();
    const next = new URL(continueHref(body), 'https://app.nexdoapp.com');
    expect(next.pathname).toBe('/api/calendar/oauth/google/start');
    expect([...next.searchParams.entries()]).toEqual([['native', '1'], ['connect_token', 'token-abc'], ['ack', '1']]);
    expect(body).not.toContain('evil');
    expect(body).not.toContain('x.test');
    expect(body).not.toContain('<script');
    // Native: Cancel reuses the callback's existing failure deep link so the auth browser closes.
    expect(cancelHref(body)).toBe('nexdo://calendar-connected?calendar=error&detail=Connection+cancelled.');
  });
});
