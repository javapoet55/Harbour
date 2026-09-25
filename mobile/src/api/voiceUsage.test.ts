import { createApiClient } from './client';
import { endpoints } from './index';

/**
 * `GET`/`POST /api/voice/usage` (src/app/api/voice/usage/route.ts:8-23) against
 * `refreshVoiceUsage` / `recordVoiceUsage` (ios/App/NexdoApp.swift:529-539).
 */

const RECEIPT = { month: '2026-09', usedSeconds: 75, limitMinutes: 100, remainingSeconds: 5925, asOf: '2026-09-21T10:00:00.000Z' };

function clientFor(body: string) {
  const doFetch = jest.fn(async () => ({
    status: 200,
    redirected: false,
    url: '',
    type: 'basic',
    headers: { get: () => null },
    text: async () => body,
  })) as unknown as jest.Mock & typeof globalThis.fetch;
  return { fetch: doFetch, api: createApiClient({ baseUrl: 'https://api.example.com', fetch: doFetch }) };
}

describe('voice usage endpoints', () => {
  it('reads this month’s receipt with a GET and no body', async () => {
    const { fetch, api } = clientFor(JSON.stringify(RECEIPT));
    await expect(endpoints.voiceUsage(api)).resolves.toEqual(RECEIPT);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/voice/usage');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('records with exactly { sessionId, durationSeconds } and answers with the receipt', async () => {
    const { fetch, api } = clientFor(JSON.stringify(RECEIPT));
    const sessionId = '6F9619FF-8B86-D011-B42D-00C04FC964FF';
    await expect(endpoints.recordVoiceUsage({ sessionId, durationSeconds: 75 }, api)).resolves.toEqual(RECEIPT);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/voice/usage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ sessionId, durationSeconds: 75 });
  });
});
