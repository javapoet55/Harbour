import { createApiClient } from './client';
import { endpoints } from './index';

/**
 * The wire shape of `POST /api/assistant`, pinned against the three authorities it has to agree with:
 *
 * - `assistantRequestSchema` (src/lib/executive-contract.ts:35-41) — `transcript` plus three
 *   OPTIONAL id fields, and a refinement rejecting both `confirmActionId` and `rejectActionId` at once.
 * - `src/app/api/assistant/route.ts:8-33` — a single JSON response, never a stream.
 * - `AppModel.ask(_:accept:)` (ios/App/NexdoApp.swift:693-711), which builds `AssistantRequest`.
 */

const ORIGIN = 'https://api.example.com';

const TURN = {
  spoken: 'Here is your day.',
  visual: { summary: 'Here is your day.', sections: [{ title: 'Today', items: ['Pack the boxes'] }] },
  contextActionId: 'ctx-1',
};

function clientFor(body: string) {
  const doFetch = jest.fn(async () => ({
    status: 200,
    redirected: false,
    url: '',
    type: 'basic',
    headers: { get: () => null },
    text: async () => body,
  })) as unknown as jest.Mock & typeof globalThis.fetch;
  return { fetch: doFetch, api: createApiClient({ baseUrl: ORIGIN, fetch: doFetch }) };
}

function sentRequest(fetch: jest.Mock) {
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

it('posts only { transcript } for a plain question', async () => {
  const { fetch, api } = clientFor(JSON.stringify(TURN));

  const turn = await endpoints.assistant({ transcript: 'Nexdo, brief me for the next 5 days.' }, api);

  const { url, init, body } = sentRequest(fetch);
  expect(url).toBe(`${ORIGIN}/api/assistant`);
  expect(init.method).toBe('POST');
  expect(init.credentials).toBe('include');
  // The optional ids are OMITTED, not sent as null: the schema declares them `.optional()`.
  expect(body).toEqual({ transcript: 'Nexdo, brief me for the next 5 days.' });
  expect(turn.contextActionId).toBe('ctx-1');
});

it('carries the thread handle back as contextActionId', async () => {
  const { fetch, api } = clientFor(JSON.stringify(TURN));

  await endpoints.assistant({ transcript: 'And tomorrow?', contextActionId: 'ctx-1' }, api);

  expect(sentRequest(fetch).body).toEqual({ transcript: 'And tomorrow?', contextActionId: 'ctx-1' });
});

/** "Approve changes" (ios/App/AskResponseView.swift:60): `model.ask("yes", accept: true)`. */
it('approves with confirmActionId and the transcript "yes"', async () => {
  const { fetch, api } = clientFor(JSON.stringify(TURN));

  await endpoints.assistant({ transcript: 'yes', contextActionId: 'ctx-1', confirmActionId: 'act-9' }, api);

  expect(sentRequest(fetch).body).toEqual({ transcript: 'yes', contextActionId: 'ctx-1', confirmActionId: 'act-9' });
});

/** "Keep my current plan" (AskResponseView.swift:62): `model.ask("no", accept: false)`. */
it('rejects with rejectActionId and the transcript "no", and never sends both ids', async () => {
  const { fetch, api } = clientFor(JSON.stringify(TURN));

  await endpoints.assistant({ transcript: 'no', contextActionId: 'ctx-1', rejectActionId: 'act-9' }, api);

  const { body } = sentRequest(fetch);
  expect(body).toEqual({ transcript: 'no', contextActionId: 'ctx-1', rejectActionId: 'act-9' });
  expect(body.confirmActionId).toBeUndefined();
});
