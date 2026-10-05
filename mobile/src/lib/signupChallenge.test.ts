// The configured URL as typed, with a trailing slash; the API client normalises it to the bare origin.
jest.mock('../config', () => ({ getApiUrl: () => 'https://app.nexdo.test/' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'state-1234567890123456' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const mockGet = jest.fn();
jest.mock('../api', () => ({ getApi: () => ({ baseUrl: 'https://app.nexdo.test', get: (...args: unknown[]) => mockGet(...args) }) }));

import { openAuthSessionAsync } from 'expo-web-browser';

import { ApiError } from '../api/client';
import { resetOAuthCallbacks } from './oauthCallbacks';
import { signupChallenge } from './signupChallenge';

/** `AppModel.signupChallengeURL` (NexdoApp.swift:174-183) and `SignUpView.create()` (RootView.swift:676-693). */

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
  await expect(signupChallenge()).rejects.toThrow('security check');
});

it('fails closed on missing configuration', async () => {
  mockGet.mockResolvedValue({ required: true, siteKey: '' });
  await expect(signupChallenge()).rejects.toThrow('security check');
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});

it('allows only server-configured local development without a challenge', async () => {
  mockGet.mockResolvedValue({ required: false, siteKey: '' });
  expect(await signupChallenge()).toBeUndefined();
});

// Swift catches every challenge failure and shows one message (RootView.swift:687-693).
it.each([
  ['a config request that fails', () => mockGet.mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK', message: 'offline' }))],
  ['an insecure API origin', () => mockGet.mockRejectedValue(new ApiError({ status: 0, code: 'INSECURE_URL', message: 'insecure' }))],
  ['a missing site key', () => mockGet.mockResolvedValue({ required: true })],
  ['a browser that will not open', () => (openAuthSessionAsync as jest.Mock).mockRejectedValue(new Error('No browser'))],
])("shows Swift's one message for %s", async (_name, arrange) => {
  arrange();
  await expect(signupChallenge()).rejects.toThrow(/^Please complete the security check and try again\.$/);
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
  expect(openAuthSessionAsync).toHaveBeenCalledWith('https://app.nexdo.test/signup-challenge?state=state-1234567890123456', 'nexdo://signup-challenge');
});
