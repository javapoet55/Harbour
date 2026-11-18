import { ApiError, createApiClient } from './client';
import { ACCOUNT_EXISTS_MESSAGE, RESET_UNKNOWN_EMAIL_MESSAGE, accountExistsConflict, endpoints, unknownResetEmail } from './index';

/**
 * Phase 14 auth plumbing (8592a0a, 60212f3): the new `account-exists` call, and register's 409 and the
 * reset request's 404 read as typed results rather than generic errors.
 */

const ORIGIN = 'https://api.example.com';

function clientFor(status: number, body: string) {
  const doFetch = jest.fn(async () => ({
    status,
    redirected: false,
    url: '',
    type: 'basic',
    headers: { get: () => null },
    text: async () => body,
  })) as unknown as jest.Mock & typeof globalThis.fetch;
  return { fetch: doFetch, api: createApiClient({ baseUrl: ORIGIN, fetch: doFetch }) };
}

describe('POST /api/auth/account-exists', () => {
  it('posts { email } and reads { exists }', async () => {
    const { fetch, api } = clientFor(200, JSON.stringify({ exists: true }));

    const result = await endpoints.accountExists('visakan+signintest@apzzo.com', api);

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/api/auth/account-exists`);
    expect(init.method).toBe('POST');
    expect(String(init.body)).not.toContain('%2B');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'visakan+signintest@apzzo.com' });
    expect(result).toEqual({ exists: true });
  });

  // `treatUnauthorizedAsSignedOut: false` (NexdoApp.swift:199): a 401 here never signs the app out.
  it('does not treat a 401 as a sign-out', async () => {
    const onSignedOut = jest.fn();
    const doFetch = jest.fn(async () => ({ status: 401, redirected: false, url: '', type: 'basic', headers: { get: () => null }, text: async () => '{"error":"nope"}' })) as unknown as typeof globalThis.fetch;
    const api = createApiClient({ baseUrl: ORIGIN, fetch: doFetch, onSignedOut });

    await expect(endpoints.accountExists('a@b.co', api)).rejects.toMatchObject({ status: 401 });
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});

describe('register 409 → accountExistsConflict', () => {
  it('reads the server’s 409 through the real client', async () => {
    const { api } = clientFor(409, JSON.stringify({ error: ACCOUNT_EXISTS_MESSAGE }));
    const error = await endpoints.register('Sri', 'a@b.co', 'pw', api).catch((caught: unknown) => caught);
    expect(accountExistsConflict(error)).toEqual({ message: ACCOUNT_EXISTS_MESSAGE });
  });

  // The client's generic 409 text is about schedules; it must never reach the sign-up alert.
  it('falls back to the account text when the 409 has no body', () => {
    expect(accountExistsConflict(new ApiError({ status: 409, message: 'Your schedule changed or could not be refreshed. Ask for a fresh plan before making changes.' }))).toEqual({ message: ACCOUNT_EXISTS_MESSAGE });
  });

  it.each([
    ['a 400', new ApiError({ status: 400, message: 'Enter a password (72 bytes maximum).' })],
    ['a 429', new ApiError({ status: 429, message: 'Too many attempts. Please try again later.' })],
    ['a schedule warning 409', new ApiError({ status: 409, code: 'SCHEDULE_WARNING', message: 'x', warnings: ['x'] })],
    ['a network failure', new ApiError({ status: 0, code: 'NETWORK', message: 'offline' })],
    ['a plain error', new Error('boom')],
  ])('is null for %s', (_, error) => {
    expect(accountExistsConflict(error)).toBeNull();
  });
});

describe('password-reset/request 404 → unknownResetEmail', () => {
  it('reads the server’s 404 through the real client', async () => {
    const { api } = clientFor(404, JSON.stringify({ error: RESET_UNKNOWN_EMAIL_MESSAGE }));
    const error = await endpoints.passwordResetRequest('nobody@example.com', api).catch((caught: unknown) => caught);
    expect(unknownResetEmail(error)).toEqual({ message: RESET_UNKNOWN_EMAIL_MESSAGE });
  });

  it('falls back to the reset text when the 404 has no body', () => {
    expect(unknownResetEmail(new ApiError({ status: 404, message: 'The request could not be completed (404). Refresh to check the current state before retrying.' }))).toEqual({ message: RESET_UNKNOWN_EMAIL_MESSAGE });
  });

  it.each([
    ['a 429 (server issue 1: the send limit runs before the lookup)', new ApiError({ status: 429, message: 'Too many attempts. Please try again later.' })],
    ['a 503', new ApiError({ status: 503, message: 'We couldn’t send the email right now. Please try again in a few minutes.' })],
    ['a plain error', new Error('boom')],
  ])('is null for %s', (_, error) => {
    expect(unknownResetEmail(error)).toBeNull();
  });
});
