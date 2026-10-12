import { createApiClient, isApiError } from './client';
import { followUpApi, followUpScheduleBody } from './followUp';

/**
 * `/api/tasks/{id}/preparation` against src/app/api/tasks/[id]/preparation/route.ts. The bodies are
 * the server's own fixtures (src/server/follow-up.integration.test.ts:8).
 */

type Sent = { url: string; method: string; body: unknown };

function clientAnswering(status: number, body: string) {
  const sent: Sent[] = [];
  const doFetch = (async (url: string, init: { method: string; body?: string }) => {
    sent.push({ url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return { status, redirected: false, url: '', type: 'basic', headers: { get: () => null }, text: async () => body };
  }) as unknown as typeof globalThis.fetch;
  return { client: createApiClient({ baseUrl: 'https://api.example.com', fetch: doFetch }), sent };
}

const preparation = {
  company: 'Insurance company',
  purpose: 'Claim status',
  phone: '',
  email: '',
  notes: 'Reference 123',
  draft: 'Please share the claim status.',
  checklist: [{ id: 'one', title: 'Have reference ready', done: true }],
  outcomes: [],
};

describe('follow-up preparation API', () => {
  it('loads the empty envelope a task starts with', async () => {
    const { client, sent } = clientAnswering(200, '{"revision":0,"preparation":null}');
    expect(await followUpApi.load('t/1', client)).toEqual({ revision: 0, preparation: null });
    expect(sent[0]).toMatchObject({ url: 'https://api.example.com/api/tasks/t%2F1/preparation', method: 'GET' });
  });

  it('PUTs the whole envelope and gets the next revision back', async () => {
    const { client, sent } = clientAnswering(200, JSON.stringify({ revision: 1, preparation }));
    const saved = await followUpApi.save('t1', { revision: 0, preparation }, client);
    expect(saved.revision).toBe(1);
    expect(sent[0]).toMatchObject({ method: 'PUT', body: { revision: 0, preparation } });
  });

  it.each([
    [409, 'This preparation changed on another device. Reopen it before saving.'],
    [400, 'Check the preparation fields and try again.'],
    [404, 'Not found.'],
  ])('surfaces the server message for %i', async (status, message) => {
    const { client } = clientAnswering(status, JSON.stringify({ error: message }));
    const error = await followUpApi.save('t1', { revision: 0, preparation }, client).catch((caught: unknown) => caught);
    expect(isApiError(error) && error.status === status && error.message).toBe(message);
  });

  it('schedules with a whole-second UTC start and the task’s own duration', () => {
    expect(followUpScheduleBody(Date.parse('2026-10-10T17:30:00.450Z'), 15)).toEqual({ startAt: '2026-10-10T17:30:00Z', durationMin: 15 });
  });
});
