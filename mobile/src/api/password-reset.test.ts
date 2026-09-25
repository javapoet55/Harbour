import { createApiClient } from './client';
import { endpoints } from './index';

/**
 * The exact wire shape of the two password-reset calls, pinned against the three authorities they
 * have to agree with:
 *
 * - `src/app/api/auth/password-reset/request/route.ts` reads `body.email`.
 * - `src/app/api/auth/password-reset/confirm/route.ts` reads `body.email`, `body.code`, `body.password`.
 * - `AppModel.requestPasswordReset` / `confirmPasswordReset` (ios/App/NexdoApp.swift:192–208) and the
 *   web page (src/app/reset-password/page.tsx:23,40) post the same paths and field names.
 */

const ORIGIN = 'https://api.example.com';

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

/** The (url, init) pair the client handed to fetch, with the JSON body parsed back. */
function sentRequest(fetch: jest.Mock) {
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

it('posts { email } to /api/auth/password-reset/request', async () => {
  const { fetch, api } = clientFor(JSON.stringify({ message: 'If that account exists…', delivered: true }));

  const response = await endpoints.passwordResetRequest('person@example.com', api);

  const { url, init, body } = sentRequest(fetch);
  expect(url).toBe(`${ORIGIN}/api/auth/password-reset/request`);
  expect(init.method).toBe('POST');
  expect(init.credentials).toBe('include');
  expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  // Exactly the one field the route reads — no extra keys, no renamed key.
  expect(body).toEqual({ email: 'person@example.com' });
  expect(response.delivered).toBe(true);
});

it('posts { email, code, password } to /api/auth/password-reset/confirm', async () => {
  const { fetch, api } = clientFor(JSON.stringify({ ok: true }));

  await endpoints.passwordResetConfirm('person@example.com', '123456', 'a-long-enough-password', api);

  const { url, init, body } = sentRequest(fetch);
  expect(url).toBe(`${ORIGIN}/api/auth/password-reset/confirm`);
  expect(init.method).toBe('POST');
  expect(body).toEqual({ email: 'person@example.com', code: '123456', password: 'a-long-enough-password' });
});

/**
 * Plus-addressing. The client must hand the address to `JSON.stringify` untouched: no
 * `encodeURIComponent`, no query string, no form encoding — all three of which turn `+` into `%2B`
 * or a space and make the server's `normalizeEmail` look up an address the user never typed.
 *
 * These assert on the raw body STRING, not the parsed object, so a re-encoded `+` fails here even
 * though `JSON.parse` would hide it.
 */
describe('plus-addressed emails travel verbatim', () => {
  const PLUS = 'visakan+signintest@apzzo.com';

  it('keeps + unencoded in the password-reset/request body', async () => {
    const { fetch, api } = clientFor(JSON.stringify({ message: 'ok', delivered: true }));

    await endpoints.passwordResetRequest(PLUS, api);

    const { init, body } = sentRequest(fetch);
    expect(String(init.body)).toContain('visakan+signintest@apzzo.com');
    expect(String(init.body)).not.toContain('%2B');
    expect(body.email).toBe(PLUS);
  });

  it('keeps + unencoded in the password-reset/confirm body', async () => {
    const { fetch, api } = clientFor(JSON.stringify({ ok: true }));

    await endpoints.passwordResetConfirm(PLUS, '123456', 'a-long-enough-password', api);

    const { init, body } = sentRequest(fetch);
    expect(String(init.body)).toContain('visakan+signintest@apzzo.com');
    expect(String(init.body)).not.toContain('%2B');
    expect(body).toEqual({ email: PLUS, code: '123456', password: 'a-long-enough-password' });
  });

  // Same client, same JSON body: verify-email/resend must not regress into encoding either.
  it('keeps + unencoded in the verify-email/resend body', async () => {
    const { fetch, api } = clientFor(JSON.stringify({ message: 'ok', delivered: true }));

    await endpoints.resendVerification(PLUS, api);

    const { url, init, body } = sentRequest(fetch);
    expect(url).toBe(`${ORIGIN}/api/auth/verify-email/resend`);
    expect(String(init.body)).toContain('visakan+signintest@apzzo.com');
    expect(String(init.body)).not.toContain('%2B');
    expect(body).toEqual({ email: PLUS });
  });
});
