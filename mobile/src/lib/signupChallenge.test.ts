// The configured URL as typed, with a trailing slash; the API client normalises it to the bare origin.
jest.mock('../config', () => ({ getApiUrl: () => 'https://app.nexdo.test/' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'state-1234567890123456' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const mockGet = jest.fn();
jest.mock('../api', () => ({ getApi: () => ({ baseUrl: 'https://app.nexdo.test', get: (...args: unknown[]) => mockGet(...args) }) }));

import { openAuthSessionAsync } from 'expo-web-browser';

import { ApiError } from '../api/client';
import { deliverOAuthCallback, resetOAuthCallbacks } from './oauthCallbacks';
import { SECURITY_CHECK_CANCELLED, SECURITY_CHECK_UNAVAILABLE, signupChallenge, SignupChallengeCancelled } from './signupChallenge';

/** `AppModel.signupChallengeURL` (NexdoApp.swift:187-196) and `SignUpView.create()` (RootView.swift:771-796). */

const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  resetOAuthCallbacks();
  jest.clearAllMocks();
  // The challenge never fetches on its own: everything goes through the API client.
  global.fetch = fetchMock;
  fetchMock.mockRejectedValue(new Error('bare fetch used'));
  mockGet.mockResolvedValue({ required: true, siteKey: 'public-site-key' });
});
afterAll(() => {
  global.fetch = originalFetch;
});

it('returns a token only from the matching signup callback', async () => {
  (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'nexdo://signup-challenge?state=state-1234567890123456&token=token' });
  expect(await signupChallenge()).toBe('token');
});

it.each(['nexdo://signup-challenge?state=wrong&token=token', 'nexdo://wrong?state=state-1234567890123456&token=token'])('rejects a mismatched callback %s', async (url) => {
  (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url });
  await expect(signupChallenge()).rejects.toThrow(SignupChallengeCancelled);
});

// Swift says "Nexdo could not start the calendar connection." here (§24 bug 11); Android names the check.
it('fails closed on missing configuration', async () => {
  mockGet.mockResolvedValue({ required: true, siteKey: '' });
  await expect(signupChallenge()).rejects.toThrow(SECURITY_CHECK_UNAVAILABLE);
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});

it('allows only server-configured local development without a challenge', async () => {
  mockGet.mockResolvedValue({ required: false, siteKey: '' });
  expect(await signupChallenge()).toBeUndefined();
});

// Phase 14 (RootView.swift:785-793): a config failure shows the server's own text, as
// `error.localizedDescription` does — including the new 503.
it.each([
  ['a 503', new ApiError({ status: 503, message: 'Account security checks are temporarily unavailable. Please try again shortly.' })],
  ['a network failure', new ApiError({ status: 0, code: 'NETWORK', message: 'offline' })],
  ['an insecure API origin', new ApiError({ status: 0, code: 'INSECURE_URL', message: 'insecure' })],
])('passes on the config request’s own error for %s', async (_name, error) => {
  mockGet.mockRejectedValue(error);
  await expect(signupChallenge()).rejects.toBe(error);
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});

it('fails closed on a missing site key', async () => {
  mockGet.mockResolvedValue({ required: true });
  await expect(signupChallenge()).rejects.toThrow(SECURITY_CHECK_UNAVAILABLE);
});

// `session?.start() != true` → `CancellationError` → "Security check cancelled…" (§24 bug 10, kept).
it('reads a browser that will not open as a cancel', async () => {
  (openAuthSessionAsync as jest.Mock).mockRejectedValue(new Error('No browser'));
  await expect(signupChallenge()).rejects.toThrow(SECURITY_CHECK_CANCELLED);
});

// `api.request("/api/auth/signup-config", treatUnauthorizedAsSignedOut: false)` (NexdoApp.swift:176): the
// client's HTTPS origin check, Accept header and timeout; a 401 here is not a sign-out.
it('asks for the config through the API client, not a bare fetch', async () => {
  (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'nexdo://signup-challenge?state=state-1234567890123456&token=token' });
  await signupChallenge();
  expect(mockGet).toHaveBeenCalledWith('/api/auth/signup-config', { signedOutOn401: false });
  expect(fetchMock).not.toHaveBeenCalled();
});

// `parts.path = "/signup-challenge"` on the API base URL, with `state` as a query item (NexdoApp.swift:178-181).
it('opens the challenge page on the API origin, whatever the configured URL looks like', async () => {
  (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'nexdo://signup-challenge?state=state-1234567890123456&token=token' });
  await signupChallenge();
  // 310f1ab: `prefersEphemeralWebBrowserSession = true` — no "wants to use … to sign in" prompt on iOS.
  expect(openAuthSessionAsync).toHaveBeenCalledWith('https://app.nexdo.test/signup-challenge?state=state-1234567890123456', 'nexdo://signup-challenge', { preferEphemeralSession: true });
});

// `URLComponents.queryItems` (RootView.swift:570-572) percent-decodes but keeps '+'; WHATWG `URL`'s
// `searchParams` would turn it into a space and break the token.
it('reads the callback as URLComponents does', async () => {
  (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'nexdo://signup-challenge?state=state-1234567890123456&token=0.a+b%2Fc_d' });
  expect(await signupChallenge()).toBe('0.a+b/c_d');
});

it.each([
  ['no token', 'nexdo://signup-challenge?state=state-1234567890123456'],
  ['an empty token', 'nexdo://signup-challenge?state=state-1234567890123456&token='],
  ['a broken escape', 'nexdo://signup-challenge?state=state-1234567890123456&token=%E0%A4%A'],
])('rejects a callback with %s', async (_name, url) => {
  (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url });
  await expect(signupChallenge()).rejects.toThrow(SECURITY_CHECK_CANCELLED);
});

/**
 * Android's `openAuthSessionAsync` polyfill can report `dismiss` before the redirect's deep link
 * arrives. Swift's session only ever ends with the callback or a cancel, so a finished check must still
 * yield its token: the same late-callback window the calendar and Moments email flows use.
 */
describe('a redirect that arrives after the browser reports dismiss', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('still yields the token a second later', async () => {
    (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });
    const outcome = signupChallenge().then((token) => ({ token }), (error: Error) => ({ error: error.message }));
    await jest.advanceTimersByTimeAsync(1000);
    deliverOAuthCallback('signup', 'nexdo://signup-challenge?state=state-1234567890123456&token=late');
    await jest.advanceTimersByTimeAsync(10);
    expect(await outcome).toEqual({ token: 'late' });
  });

  it('is a cancel when nothing arrives', async () => {
    (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });
    const outcome = signupChallenge().then((token) => ({ token }), (error: Error) => ({ error: error.message }));
    await jest.advanceTimersByTimeAsync(2000);
    expect(await outcome).toEqual({ error: 'Security check cancelled. Tap Create Account to try again.' });
  });
});
