import { createApiClient } from './client';
import { bugReportApi } from './feedback';
import { bugFailureMessage } from '../features/bugReport/model';

/** `POST /api/feedback/bugs` against src/app/api/feedback/bugs/route.ts. */

function clientAnswering(status: number, body: string) {
  const sent: { url: string; body: unknown }[] = [];
  const doFetch = (async (url: string, init: { body?: string }) => {
    sent.push({ url, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return { status, redirected: false, url: '', type: 'basic', headers: { get: () => null }, text: async () => body };
  }) as unknown as typeof globalThis.fetch;
  return { client: createApiClient({ baseUrl: 'https://api.example.com', fetch: doFetch }), sent };
}

const input = {
  id: '11111111-1111-4111-8111-111111111111',
  description: 'Calendar issue',
  metadata: { appVersion: '1', buildNumber: '1', deviceModel: 'Pixel 8', iosVersion: '14', screen: 'calendar' as const, timestamp: '2026-10-10T12:00:00Z', correlationID: '22222222-2222-4222-8222-222222222222' },
  screenshotConsent: false,
};

it('posts the report and reads the six-digit reference', async () => {
  const { client, sent } = clientAnswering(200, '{"reference":"BR-004211"}');
  expect(await bugReportApi.submit(input, client)).toEqual({ reference: 'BR-004211' });
  expect(sent[0]).toEqual({ url: 'https://api.example.com/api/feedback/bugs', body: input });
});

it.each([
  [413, '{"error":"Screenshot is too large."}', 'Screenshot is too large.'],
  [429, '{"error":"Too many attempts. Please try again later."}', 'Too many attempts. Please try again later.'],
  [404, '<html>Not Found</html>', 'Bug reporting is not available on this server yet. Please try again later.'],
  [401, '{"error":"Sign in required."}', 'Your session has expired. Please sign in again before sending your report.'],
])('a %i reads as the form shows it', async (status, body, message) => {
  const { client } = clientAnswering(status, body);
  const error = await bugReportApi.submit(input, client).catch((caught: unknown) => caught);
  expect(bugFailureMessage(error)).toBe(message);
});
