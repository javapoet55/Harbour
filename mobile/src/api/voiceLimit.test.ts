import { ApiError, createApiClient, isVoiceLimitReached } from './client';
import { shoppingApi } from './shopping';
import { fetchSpeech } from '../voice/speech';
import { START_FAILED, startupErrorFor } from '../voice/useVoiceSession';

jest.mock('../config', () => ({ getApiUrl: () => 'https://api.example.com' }));

/**
 * The monthly voice admission limit (94da063): `voiceAllowanceResponse` (src/server/voice/usage.ts)
 * refuses every paid voice route with this body before the provider is called — pinned by the server's
 * allowance.integration.test.ts and the four route tests.
 */
const MESSAGE = 'You have used your 100 minutes of voice this month. Voice will be available again next month. You can still type your requests.';
const BODY = { error: MESSAGE, code: 'VOICE_MONTHLY_LIMIT_REACHED', month: '2026-09', usedSeconds: 6000, limitMinutes: 100, remainingSeconds: 0, asOf: '2026-10-01T06:59:00.000Z' };

function clientAnswering(status: number, body: unknown) {
  const doFetch = (async () => ({ status, redirected: false, url: '', type: 'basic', headers: { get: () => null }, text: async () => JSON.stringify(body) })) as unknown as typeof globalThis.fetch;
  return createApiClient({ baseUrl: 'https://api.example.com', fetch: doFetch });
}

it('reads the 429 as the limit, with the server’s words and this month’s receipt', async () => {
  const error = await shoppingApi.transcriptionSession(clientAnswering(429, BODY)).catch((caught: unknown) => caught);
  expect(isVoiceLimitReached(error)).toBe(true);
  expect((error as ApiError).status).toBe(429);
  expect((error as ApiError).message).toBe(MESSAGE);
  expect((error as ApiError).voiceUsage).toEqual({ month: '2026-09', usedSeconds: 6000, limitMinutes: 100, remainingSeconds: 0, asOf: '2026-10-01T06:59:00.000Z' });
});

it('leaves any other 429 an ordinary error', async () => {
  const error = await shoppingApi.transcriptionSession(clientAnswering(429, { error: 'Too many attempts. Please try again later.' })).catch((caught: unknown) => caught);
  expect(isVoiceLimitReached(error)).toBe(false);
  expect((error as ApiError).message).toBe('Too many attempts. Please try again later.');
});

it('shows the limit, and only the limit, in place of the generic start failure', () => {
  expect(startupErrorFor(new ApiError({ status: 429, code: 'VOICE_MONTHLY_LIMIT_REACHED', message: MESSAGE }))).toBe(MESSAGE);
  expect(startupErrorFor(new ApiError({ status: 502, message: 'Voice connection unavailable. Please try again later.' }))).toBe(START_FAILED);
  expect(startupErrorFor(new Error('boom'))).toBe(START_FAILED);
});

it('says why /api/speech refused, rather than that the audio would not play', async () => {
  const limited = jest.fn(async () => ({ ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => BODY })) as unknown as typeof fetch;
  const error = await fetchSpeech('Read this aloud', limited).catch((caught: unknown) => caught);
  expect(isVoiceLimitReached(error)).toBe(true);
  expect((error as Error).message).toBe(MESSAGE);

  const broken = jest.fn(async () => ({ ok: false, status: 500, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Request failed.' }) })) as unknown as typeof fetch;
  await expect(fetchSpeech('x', broken)).rejects.toThrow('Nexdo could not play the voice response.');
});
