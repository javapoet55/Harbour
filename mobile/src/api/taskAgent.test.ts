import { createApiClient } from './client';
import { taskAgentApi, type TaskAgentUpdate } from './taskAgent';

/**
 * The body `POST /api/tasks/:id/agent` receives.
 *
 * The route validates `key`, `answer`, `budget`, `constraints` and `candidateId` with zod `.optional()`
 * and NO `.nullable()` (src/app/api/tasks/[id]/agent/route.ts:7). zod accepts a missing key and rejects
 * an explicit null, so every absent field has to be omitted, as Swift's `Codable` omits a nil one. A
 * null made the route answer 400 "Please enter a valid answer." for every action, on every Android
 * build, and the business search never started.
 */

function capturingClient() {
  const bodies: unknown[] = [];
  const doFetch = jest.fn(async (_url: string, init: { body?: string }) => {
    bodies.push(init.body === undefined ? undefined : JSON.parse(init.body));
    return {
      status: 200,
      redirected: false,
      url: '',
      type: 'basic',
      headers: { get: () => null },
      text: async () => '{"run":null,"intent":null}',
    };
  }) as unknown as jest.Mock & typeof globalThis.fetch;
  return { client: createApiClient({ baseUrl: 'https://api.example.com', fetch: doFetch }), bodies };
}

/** Every key whose value is null, at any depth. */
function nullKeys(value: unknown, path = ''): string[] {
  if (value === null) return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => nullKeys(item, `${path}[${index}]`));
  if (typeof value === 'object') return Object.entries(value as object).flatMap(([key, item]) => nullKeys(item, path ? `${path}.${key}` : key));
  return [];
}

async function bodyFor(input: TaskAgentUpdate): Promise<Record<string, unknown>> {
  const { client, bodies } = capturingClient();
  await taskAgentApi.update('t1', input, client);
  return bodies[0] as Record<string, unknown>;
}

describe('POST /api/tasks/:id/agent never sends a null (route.ts:7)', () => {
  it('omits key and candidateId for the search the retired-question step sends', async () => {
    const body = await bodyFor({ action: 'search', version: 3, key: null, answer: '94582', candidateId: null });
    expect(nullKeys(body)).toEqual([]);
    expect(body).toEqual({ action: 'search', version: 3, answer: '94582', budget: '', constraints: '' });
    expect('key' in body).toBe(false);
    expect('candidateId' in body).toBe(false);
  });

  it('omits candidateId for an answer, and keeps the key it does have', async () => {
    const body = await bodyFor({ action: 'answer', version: 1, key: 'discovery', answer: 'yes', candidateId: null });
    expect(nullKeys(body)).toEqual([]);
    expect(body).toEqual({ action: 'answer', version: 1, key: 'discovery', answer: 'yes', budget: '', constraints: '' });
  });

  it('sends prepare with nothing but the action, version and the two empty slots Swift sends', async () => {
    const body = await bodyFor({ action: 'prepare', version: 0 });
    expect(nullKeys(body)).toEqual([]);
    expect(body).toEqual({ action: 'prepare', version: 0, budget: '', constraints: '' });
  });

  it('keeps budget and constraints as the empty strings Swift sends, not nulls', async () => {
    const body = await bodyFor({ action: 'search', version: 2, answer: 'Danville' });
    expect(body.budget).toBe('');
    expect(body.constraints).toBe('');
  });

  it('carries a saveDraft candidateId and draft through', async () => {
    const body = await bodyFor({ action: 'saveDraft', version: 4, answer: 'Hello, could you quote?', candidateId: 'c1' });
    expect(nullKeys(body)).toEqual([]);
    expect(body).toEqual({ action: 'saveDraft', version: 4, answer: 'Hello, could you quote?', candidateId: 'c1', budget: '', constraints: '' });
  });

  it.each(['cancel', 'pause', 'resume', 'retry'] as const)('sends no null for %s', async (action) => {
    expect(nullKeys(await bodyFor({ action, version: 5, key: null, answer: null, candidateId: null }))).toEqual([]);
  });
});
