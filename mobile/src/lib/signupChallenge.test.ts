jest.mock('../config', () => ({ getApiUrl: () => 'https://app.nexdo.test' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'state-1234567890123456' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
import { openAuthSessionAsync } from 'expo-web-browser';
import { signupChallenge } from './signupChallenge';
import { resetOAuthCallbacks } from './oauthCallbacks';
const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => { resetOAuthCallbacks(); jest.clearAllMocks(); global.fetch = fetchMock; fetchMock.mockResolvedValue({ ok: true, json: async () => ({ required: true, siteKey: 'public-site-key' }) }); });
afterAll(() => { global.fetch = originalFetch; });
it('returns a token only from the matching signup callback', async () => {
  (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'nexdo://signup-challenge?state=state-1234567890123456&token=token' });
  expect(await signupChallenge()).toBe('token');
});
it.each(['nexdo://signup-challenge?state=wrong&token=token', 'nexdo://wrong?state=state-1234567890123456&token=token'])('rejects a mismatched callback %s', async url => {
  (openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url });
  await expect(signupChallenge()).rejects.toThrow('security check');
});
it('fails closed on missing configuration', async () => { fetchMock.mockResolvedValue({ ok: true, json: async () => ({ required: true, siteKey: '' }) }); await expect(signupChallenge()).rejects.toThrow('security check'); expect(openAuthSessionAsync).not.toHaveBeenCalled(); });
it('allows only server-configured local development without a challenge', async () => { fetchMock.mockResolvedValue({ ok: true, json: async () => ({ required: false }) }); expect(await signupChallenge()).toBeUndefined(); });
// Swift catches every challenge failure and shows one message (RootView.swift:687-693).
it.each([
  ['a config request that fails', () => fetchMock.mockRejectedValue(new TypeError('Network request failed'))],
  ['a config response that is not OK', () => fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })],
  ['a config body that is not JSON', () => fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } })],
  ['a missing site key', () => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ required: true, siteKey: '' }) })],
  ['a browser that will not open', () => (openAuthSessionAsync as jest.Mock).mockRejectedValue(new Error('No browser'))],
])('shows Swift\'s one message for %s', async (_name, arrange) => {
  arrange();
  await expect(signupChallenge()).rejects.toThrow(/^Please complete the security check and try again\.$/);
});
