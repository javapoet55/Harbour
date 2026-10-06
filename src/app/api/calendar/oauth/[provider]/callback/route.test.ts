import { NextRequest } from 'next/server';
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
  return GET(new Request(`${origin}/api/calendar/oauth/${provider}/callback${query}`, { headers: { cookie: `calendar-oauth-${provider}=test-state`, ...Object.fromEntries(new Headers(headers)) } }), {
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
    expect(destination.searchParams.get('detail')).toBe('Unable to connect calendar. Please reconnect and allow the requested permissions.');
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
  });

  it('rejects invalid state before exchanging tokens', async () => {
    mocks.verifyOAuthState.mockRejectedValue(new Error('Invalid OAuth state'));
    const destination = expectSettingsRedirect(await callback('http://0.0.0.0:8080'), 'error');
    expect(destination.searchParams.get('detail')).toBe('Unable to connect calendar. Please reconnect and allow the requested permissions.');
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
    expect(mocks.syncConnection).not.toHaveBeenCalled();
  });

  it.each(['connectCalendar', 'syncConnection'] as const)('safely returns to Settings if %s fails', async stage => {
    mocks[stage].mockRejectedValue(new Error('Provider temporarily unavailable'));
    const destination = expectSettingsRedirect(await callback('http://0.0.0.0:8080'), 'error');
    expect(destination.searchParams.get('detail')).toBe('Unable to connect calendar. Please reconnect and allow the requested permissions.');
    if (stage === 'connectCalendar') expect(mocks.syncConnection).not.toHaveBeenCalled();
  });

  it('encodes and limits error text without adding redirect parameters', async () => {
    const message = 'Provider failed &calendar=google-connected#' + 'x'.repeat(150);
    mocks.connectCalendar.mockRejectedValue(new Error(message));
    const destination = expectSettingsRedirect(await callback('http://0.0.0.0:8080'), 'error');
    expect(destination.searchParams.get('detail')).toBe('Unable to connect calendar. Please reconnect and allow the requested permissions.');
    expect(destination.searchParams.getAll('calendar')).toEqual(['error']);
    expect(destination.hash).toBe('');
  });

  it.each(['', 'calendar-oauth-google=wrong'])('rejects a missing/mismatched browser cookie: %s', async cookie => {
    expectSettingsRedirect(await callback(productionOrigin, 'google', undefined, { cookie }), 'error');
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
  });

  it('returns a validated native success and clears the browser cookie', async () => {
    mocks.isNativeOAuthState.mockResolvedValue(true);
    const response = await callback(productionOrigin);
    expect(response.headers.get('location')).toBe('nexdo://calendar-connected?calendar=google-connected');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('returns native denial to the app after validating browser state', async () => {
    mocks.isNativeOAuthState.mockResolvedValue(true);
    const response = await callback(productionOrigin, 'google', '?state=test-state&error=access_denied');
    expect(response.headers.get('location')).toMatch(/^nexdo:\/\/calendar-connected\?calendar=error/);
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
  });

  it('handles unsupported providers without touching credentials', async () => {
    expectSettingsRedirect(await callback('http://0.0.0.0:8080', 'unknown'), 'unsupported');
    expect(mocks.verifyOAuthState).not.toHaveBeenCalled();
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
  });
});

describe('the request object the production server passes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifyOAuthState.mockResolvedValue('user-1');
    mocks.isNativeOAuthState.mockResolvedValue(false);
    mocks.connectCalendar.mockResolvedValue({ id: 'calendar-1' });
    mocks.syncConnection.mockResolvedValue(undefined);
  });

  const target = (provider: string, query: string) => `${productionOrigin}/api/calendar/oauth/${provider}/callback${query}`;
  const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) });

  // The App Router hands the route a NextRequest, not the plain Request every test above builds.
  it('connects when given a real NextRequest', async () => {
    const request = new NextRequest(target('google', '?code=test-code&state=test-state'), {
      headers: { cookie: 'calendar-oauth-google=test-state' },
    });
    expectSettingsRedirect(await GET(request, ctx('google')), 'google-connected');
    expect(mocks.connectCalendar).toHaveBeenCalledWith('google', 'user-1', 'test-code');
  });

  it('still refuses a mismatched cookie on a real NextRequest', async () => {
    const request = new NextRequest(target('google', '?code=test-code&state=test-state'), {
      headers: { cookie: 'calendar-oauth-google=wrong' },
    });
    expectSettingsRedirect(await GET(request, ctx('google')), 'error');
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
  });

  /**
   * What actually broke production: the route used to read the cookie through
   * `new NextRequest(req)`, and on Next 16 the request the server hands the route cannot be used to
   * construct another one -- "Cannot read private member #state from an object whose class did not
   * declare it" -- so every connect threw before reaching the try block and answered 500.
   *
   * A locally built NextRequest re-wraps without complaint, which is why the suite stayed green. This
   * stands in for the production object: `instanceof Request` holds, as it does for a Request from
   * another realm, but it carries none of the internal state `new Request(input)` copies out. Reading
   * the `Cookie` header off it, which is all the route does now, works regardless.
   */
  function unwrappableRequest(provider: string, query: string, cookie: string): Request {
    const request = Object.create(Request.prototype) as Request;
    Object.defineProperty(request, 'url', { value: target(provider, query) });
    Object.defineProperty(request, 'headers', { value: new Headers({ cookie }) });
    return request;
  }

  it('cannot be re-wrapped, which is the production failure', () => {
    const request = unwrappableRequest('google', '?code=test-code&state=test-state', 'calendar-oauth-google=test-state');
    expect(request).toBeInstanceOf(Request);
    expect(() => new NextRequest(request)).toThrow();
    expect(request.headers.get('cookie')).toBe('calendar-oauth-google=test-state');
  });

  it('connects on a request that cannot be re-wrapped', async () => {
    const request = unwrappableRequest('google', '?code=test-code&state=test-state', 'calendar-oauth-google=test-state');
    expectSettingsRedirect(await GET(request, ctx('google')), 'google-connected');
    expect(mocks.connectCalendar).toHaveBeenCalledWith('google', 'user-1', 'test-code');
  });

  it('refuses a mismatched cookie on a request that cannot be re-wrapped', async () => {
    const request = unwrappableRequest('google', '?code=test-code&state=test-state', 'calendar-oauth-google=wrong');
    expectSettingsRedirect(await GET(request, ctx('google')), 'error');
    expect(mocks.connectCalendar).not.toHaveBeenCalled();
  });

  it('also connects Outlook on a request that cannot be re-wrapped', async () => {
    const request = unwrappableRequest('microsoft', '?code=test-code&state=test-state', 'calendar-oauth-microsoft=test-state');
    expectSettingsRedirect(await GET(request, ctx('microsoft')), 'microsoft-connected');
    expect(mocks.verifyOAuthState).toHaveBeenCalledWith('test-state', 'microsoft');
  });
});

describe('reading the browser-binding cookie', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifyOAuthState.mockResolvedValue('user-1');
    mocks.isNativeOAuthState.mockResolvedValue(false);
    mocks.connectCalendar.mockResolvedValue({ id: 'calendar-1' });
    mocks.syncConnection.mockResolvedValue(undefined);
  });

  // Each header is matched against what `NextRequest(...).cookies.get()` returns for it, so the
  // comparison the route makes is the one it made before, down to the edge cases.
  it.each([
    ['the only cookie', 'calendar-oauth-google=test-state', true],
    ['among others', 'session=abc; calendar-oauth-google=test-state; theme=dark', true],
    ['with no space after the semicolon', 'session=abc;calendar-oauth-google=test-state', true],
    ['with extra leading spaces', 'session=abc;   calendar-oauth-google=test-state', true],
    ['repeated, last value winning', 'calendar-oauth-google=wrong; calendar-oauth-google=test-state', true],
    ['repeated, last value losing', 'calendar-oauth-google=test-state; calendar-oauth-google=wrong', false],
    ['a prefix of the name only', 'calendar-oauth-googlex=test-state', false],
    ['a suffix of the name only', 'xcalendar-oauth-google=test-state', false],
    ['an empty value', 'calendar-oauth-google=', false],
    ['the name with no value', 'calendar-oauth-google', false],
    ['a space before the equals', 'calendar-oauth-google =test-state', false],
    ['a space after the equals', 'calendar-oauth-google= test-state', false],
    ['no cookie header at all', '', false],
    ['another provider’s cookie', 'calendar-oauth-microsoft=test-state', false],
  ])('%s: connects=%s', async (_name, cookie, connects) => {
    const request = new NextRequest(`${productionOrigin}/api/calendar/oauth/google/callback?code=test-code&state=test-state`, {
      headers: cookie === '' ? {} : { cookie },
    });
    // The parser the route uses must agree with the one it replaced on every header above.
    expect(request.cookies.get('calendar-oauth-google')?.value === 'test-state').toBe(connects);
    expectSettingsRedirect(await GET(request, { params: Promise.resolve({ provider: 'google' }) }), connects ? 'google-connected' : 'error');
  });
});
