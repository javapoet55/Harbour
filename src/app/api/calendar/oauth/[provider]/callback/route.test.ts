import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyOAuthState: vi.fn(),
  isNativeOAuthState: vi.fn(),
  connectCalendar: vi.fn(),
  syncConnection: vi.fn(),
}));
vi.mock('@/server/oauth-state', () => ({ verifyOAuthState: mocks.verifyOAuthState, isNativeOAuthState: mocks.isNativeOAuthState }));
vi.mock('@/providers/calendar', () => ({ connectCalendar: mocks.connectCalendar }));
vi.mock('@/server/calendar-sync', () => ({ syncConnection: mocks.syncConnection }));

import { GET } from './route';

const productionOrigin = 'https://app.nexdoapp.com';
const localOrigin = 'http://127.0.0.1:43217';

function callback(origin: string, provider = 'google', query = '?code=test-code&state=test-state', headers?: HeadersInit) {
  return GET(new Request(`${origin}/api/calendar/oauth/${provider}/callback${query}`, { headers }), {
    params: Promise.resolve({ provider }),
  });
}

function expectSettingsRedirect(response: Response, calendar: string, visibleOrigin = productionOrigin) {
  expect(response.status).toBe(303);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const location = response.headers.get('location')!;
  expect(location).toMatch(/^\/settings\?/);
  const destination = new URL(location, visibleOrigin);
  expect(destination.origin).toBe(visibleOrigin);
  expect(destination.pathname).toBe('/settings');
  expect(destination.searchParams.get('calendar')).toBe(calendar);
  expect(destination.searchParams.has('code')).toBe(false);
  expect(destination.searchParams.has('state')).toBe(false);
  return destination;
}

describe('calendar OAuth callback redirects', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifyOAuthState.mockResolvedValue('user-1');
    mocks.isNativeOAuthState.mockResolvedValue(false);
    mocks.connectCalendar.mockResolvedValue({ id: 'calendar-1' });
    mocks.syncConnection.mockResolvedValue(undefined);
  });

  it.each([
    ['http://0.0.0.0:8080', productionOrigin],
    ['https://0.0.0.0:8080', productionOrigin],
    ['http://[::]:8080', productionOrigin],
    [productionOrigin, productionOrigin],
    [localOrigin, localOrigin],
  ])('keeps success on the browser origin when the request origin is %s', async (requestOrigin, browserOrigin) => {
    const response = await callback(requestOrigin);
    expectSettingsRedirect(response, 'google-connected', browserOrigin);
    expect(mocks.verifyOAuthState).toHaveBeenCalledWith('test-state', 'google');
    expect(mocks.connectCalendar).toHaveBeenCalledWith('google', 'user-1', 'test-code');
    expect(mocks.syncConnection).toHaveBeenCalledWith('user-1', 'calendar-1');
  });

  it('also keeps Microsoft callbacks on the public origin', async () => {
    expectSettingsRedirect(await callback('http://0.0.0.0:8080', 'microsoft'), 'microsoft-connected');
    expect(mocks.verifyOAuthState).toHaveBeenCalledWith('test-state', 'microsoft');
  });

  it('does not trust forwarded host or protocol headers for the redirect', async () => {
    const response = await callback('http://0.0.0.0:8080', 'google', undefined, {
      host: 'attacker.example',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'http',
      forwarded: 'host=attacker.example;proto=http',
    });
    expectSettingsRedirect(response, 'google-connected');
    expect(response.headers.get('location')).not.toContain('attacker.example');
  });

  it.each(['', '?code=test-code', '?state=test-state', '?error=access_denied'])('returns cancelled/incomplete authorization safely: %s', async query => {
    const destination = expectSettingsRedirect(await callback('http://0.0.0.0:8080', 'google', query), 'error');
    expect(destination.searchParams.get('detail')).toBe('Authorization was cancelled');
    expect(mocks.verifyOAuthState).not.toHaveBeenCalled();
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
  });

  it('rejects invalid state before exchanging tokens', async () => {
    mocks.verifyOAuthState.mockRejectedValue(new Error('Invalid OAuth state'));
    const destination = expectSettingsRedirect(await callback('http://0.0.0.0:8080'), 'error');
    expect(destination.searchParams.get('detail')).toBe('Invalid OAuth state');
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
    expect(mocks.syncConnection).not.toHaveBeenCalled();
  });

  it.each(['connectCalendar', 'syncConnection'] as const)('safely returns to Settings if %s fails', async stage => {
    mocks[stage].mockRejectedValue(new Error('Provider temporarily unavailable'));
    const destination = expectSettingsRedirect(await callback('http://0.0.0.0:8080'), 'error');
    expect(destination.searchParams.get('detail')).toBe('Provider temporarily unavailable');
    if (stage === 'connectCalendar') expect(mocks.syncConnection).not.toHaveBeenCalled();
  });

  it('encodes and limits error text without adding redirect parameters', async () => {
    const message = 'Provider failed &calendar=google-connected#' + 'x'.repeat(150);
    mocks.connectCalendar.mockRejectedValue(new Error(message));
    const destination = expectSettingsRedirect(await callback('http://0.0.0.0:8080'), 'error');
    expect(destination.searchParams.get('detail')).toBe(message.slice(0, 120));
    expect(destination.searchParams.getAll('calendar')).toEqual(['error']);
    expect(destination.hash).toBe('');
  });

  it('handles unsupported providers without touching credentials', async () => {
    expectSettingsRedirect(await callback('http://0.0.0.0:8080', 'unknown'), 'unsupported');
    expect(mocks.verifyOAuthState).not.toHaveBeenCalled();
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
  });
});
