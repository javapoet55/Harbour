import { shouldRetry } from '../query/client';
import { ApiError, createApiClient, messages, normalizeBaseUrl, redactSecrets, type Exchange } from './client';

const ORIGIN = 'https://api.example.com';

type FakeResponse = {
  status: number;
  body?: string;
  headers?: Record<string, string>;
  redirected?: boolean;
  url?: string;
  type?: string;
};

function fakeFetch(response: FakeResponse) {
  const headers = Object.fromEntries(Object.entries(response.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  return jest.fn(async (_url: string, _init?: RequestInit) => ({
    status: response.status,
    redirected: response.redirected ?? false,
    url: response.url ?? '',
    type: response.type ?? 'basic',
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => response.body ?? '',
  })) as unknown as jest.Mock & typeof fetch;
}

function clientFor(response: FakeResponse, onExchange?: (exchange: Exchange) => void) {
  const fetch = fakeFetch(response);
  return { fetch, api: createApiClient({ baseUrl: ORIGIN, fetch, onExchange }) };
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('Expected the request to fail');
}

describe('HTTPS enforcement', () => {
  it.each([
    'http://api.example.com',
    'api.example.com',
    'https://user:pass@api.example.com',
    'https://api.example.com/api',
    'https://api.example.com?x=1',
    'https://api.example.com#frag',
    'ftp://api.example.com',
  ])('rejects %s', (baseUrl) => {
    expect(() => createApiClient({ baseUrl, fetch: fakeFetch({ status: 200 }) })).toThrow(messages.insecureUrl);
    expect(() => normalizeBaseUrl(baseUrl)).toThrow(expect.objectContaining({ code: 'INSECURE_URL' }));
  });

  it('accepts an https origin and strips a trailing slash', () => {
    expect(normalizeBaseUrl('https://app.nexdoapp.com/')).toBe('https://app.nexdoapp.com');
    expect(normalizeBaseUrl('https://localhost:8443')).toBe('https://localhost:8443');
  });

  it.each(['/login', 'api/me', '//evil.example.com/api/me', 'https://evil.example.com/api/me', '/api/me\\x'])(
    'refuses path %s without making a request',
    async (path) => {
      const { api, fetch } = clientFor({ status: 200, body: '{}' });
      const error = await captureError(api.get(path));
      expect(error.code).toBe('INSECURE_URL');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe('requests', () => {
  it('sends cookies, refuses redirects and encodes JSON bodies', async () => {
    const { api, fetch } = clientFor({ status: 200, body: '{"ok":true}' });
    await expect(api.patch('/api/tasks/1', { title: 'A' })).resolves.toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${ORIGIN}/api/tasks/1`);
    expect(init).toMatchObject({
      method: 'PATCH',
      credentials: 'include',
      redirect: 'manual',
      body: '{"title":"A"}',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
  });

  it('omits Content-Type without a body', async () => {
    const { api, fetch } = clientFor({ status: 200, body: '{}' });
    await api.get('/api/me');
    expect(fetch.mock.calls[0][1].headers).toEqual({ Accept: 'application/json' });
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it('reports each exchange, including Set-Cookie visibility', async () => {
    const onExchange = jest.fn();
    const { api } = clientFor({ status: 200, body: '{"id":"u1"}', headers: { 'Set-Cookie': 'harbor_session=x' } }, onExchange);
    await api.post('/api/auth/login', { email: 'a@b.co', password: 'x' }, { signedOutOn401: false });
    expect(onExchange).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/api/auth/login', status: 200, setCookieVisible: true, bodyText: '{"id":"u1"}' }));
  });
});

describe('error mapping', () => {
  it('maps EMAIL_NOT_VERIFIED with the server message and email', async () => {
    const { api } = clientFor({
      status: 403,
      body: JSON.stringify({ code: 'EMAIL_NOT_VERIFIED', error: 'Verify your email address to sign in.', email: 'a@b.co' }),
    });
    const error = await captureError(api.post('/api/auth/login', { email: 'a@b.co', password: 'x' }, { signedOutOn401: false }));
    expect(error).toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address to sign in.', email: 'a@b.co' });
  });

  it('maps SCHEDULE_WARNING with its warnings, joined like the Swift client', async () => {
    const warnings = ['Overlaps Standup.', 'Leaves no buffer before Lunch.'];
    const { api } = clientFor({ status: 409, body: JSON.stringify({ code: 'SCHEDULE_WARNING', error: warnings.join(' '), warnings }) });
    const error = await captureError(api.post('/api/tasks', { title: 'A' }));
    expect(error).toMatchObject({ status: 409, code: 'SCHEDULE_WARNING', warnings, message: 'Overlaps Standup.\n\nLeaves no buffer before Lunch.' });
  });

  it('treats SCHEDULE_WARNING without warnings as a plain server error', async () => {
    const { api } = clientFor({ status: 409, body: JSON.stringify({ code: 'SCHEDULE_WARNING', error: 'Conflict.' }) });
    const error = await captureError(api.post('/api/tasks', {}));
    expect(error).toMatchObject({ status: 409, code: undefined, message: 'Conflict.' });
  });

  it('uses the server message for other errors', async () => {
    const { api } = clientFor({ status: 400, body: JSON.stringify({ error: 'Enter a valid task title, date, and positive duration.' }) });
    const error = await captureError(api.post('/api/tasks', {}));
    expect(error).toMatchObject({ status: 400, code: undefined, message: 'Enter a valid task title, date, and positive duration.' });
  });

  it('falls back to the Swift status messages without a JSON error', async () => {
    expect(await captureError(clientFor({ status: 409, body: '' }).api.get('/api/agenda'))).toMatchObject({ status: 409, message: messages.response(409) });
    expect(await captureError(clientFor({ status: 502, body: '<html>' }).api.get('/api/agenda'))).toMatchObject({
      status: 502,
      message: 'The request could not be completed (502). Refresh to check the current state before retrying.',
    });
  });

  it('maps 401 to SIGNED_OUT', async () => {
    const error = await captureError(clientFor({ status: 401, body: '{"user":null}' }).api.get('/api/me'));
    expect(error).toMatchObject({ status: 401, code: 'SIGNED_OUT', message: messages.signedOut });
  });

  it('keeps the server message for 401 when signedOutOn401 is off (wrong password)', async () => {
    const { api } = clientFor({ status: 401, body: JSON.stringify({ error: 'Invalid email or password.' }) });
    const error = await captureError(api.post('/api/auth/login', {}, { signedOutOn401: false }));
    expect(error).toMatchObject({ status: 401, code: undefined, message: 'Invalid email or password.' });
  });

  it('maps a failed fetch to NETWORK', async () => {
    const fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof globalThis.fetch;
    const error = await captureError(createApiClient({ baseUrl: ORIGIN, fetch }).get('/api/me'));
    expect(error).toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('maps an unparseable success body to INVALID_RESPONSE', async () => {
    const error = await captureError(clientFor({ status: 200, body: '<html></html>' }).api.get('/api/me'));
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE', message: messages.invalidResponse });
  });
});

describe('redirects mean the session is gone', () => {
  it.each(['/login', '/login?next=%2F', `${ORIGIN}/login`])('3xx to %s is SIGNED_OUT', async (location) => {
    const error = await captureError(clientFor({ status: 307, headers: { Location: location } }).api.get('/api/me'));
    expect(error.code).toBe('SIGNED_OUT');
  });

  it('an opaque redirect (Location hidden) is SIGNED_OUT', async () => {
    const error = await captureError(clientFor({ status: 0, type: 'opaqueredirect' }).api.get('/api/me'));
    expect(error.code).toBe('SIGNED_OUT');
  });

  it('a redirect the platform followed to /login is SIGNED_OUT', async () => {
    const error = await captureError(clientFor({ status: 200, redirected: true, url: `${ORIGIN}/login`, body: '<html>' }).api.get('/api/tasks'));
    expect(error.code).toBe('SIGNED_OUT');
  });

  it('a redirect to another host is not treated as the login page', async () => {
    const error = await captureError(clientFor({ status: 302, headers: { Location: 'https://evil.example.com/login' } }).api.get('/api/me'));
    expect(error).toMatchObject({ status: 302, code: undefined });
  });

  it('a followed redirect elsewhere is INVALID_RESPONSE, not data', async () => {
    const error = await captureError(clientFor({ status: 200, redirected: true, url: `${ORIGIN}/welcome`, body: '{"user":{}}' }).api.get('/api/me'));
    expect(error.code).toBe('INVALID_RESPONSE');
  });
});

describe('query retry policy', () => {
  it('does not retry client errors', () => {
    expect(shouldRetry(0, new ApiError({ status: 401, code: 'SIGNED_OUT', message: '' }))).toBe(false);
    expect(shouldRetry(0, new ApiError({ status: 404, message: '' }))).toBe(false);
    expect(shouldRetry(0, new ApiError({ status: 200, code: 'INVALID_RESPONSE', message: '' }))).toBe(false);
  });

  it('retries network and server errors twice', () => {
    const network = new ApiError({ status: 0, code: 'NETWORK', message: '' });
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, new ApiError({ status: 503, message: '' }))).toBe(true);
    expect(shouldRetry(2, network)).toBe(false);
  });
});

describe('dev request log redaction', () => {
  it('blanks every credential-bearing key', () => {
    const body = JSON.stringify({
      email: 'visakan+signintest@apzzo.com',
      password: 'a-long-enough-password',
      newPassword: 'another-one',
      code: '123456',
      token: 'SECRET-TOKEN-VALUE',
      authorizationCode: 'SECRET-AUTH-CODE',
      rawNonce: 'SECRET-NONCE',
    });
    const redacted = redactSecrets(body);

    for (const secret of ['a-long-enough-password', 'another-one', '123456', 'SECRET-TOKEN-VALUE', 'SECRET-AUTH-CODE', 'SECRET-NONCE']) {
      expect(redacted).not.toContain(secret);
    }
    // The address is diagnostic, not a secret: plus-addressing must stay visible and unencoded.
    expect(redacted).toContain('visakan+signintest@apzzo.com');
    expect(JSON.parse(redacted)).toMatchObject({ password: '***', code: '***', rawNonce: '***' });
  });

  it('survives a quote escaped inside a secret', () => {
    const body = JSON.stringify({ password: 'pa"ss\word', email: 'a@b.com' });
    expect(JSON.parse(redactSecrets(body))).toEqual({ password: '***', email: 'a@b.com' });
  });

  it('leaves a body with no secrets untouched', () => {
    const body = JSON.stringify({ email: 'a@b.com', title: 'Ship the thing' });
    expect(redactSecrets(body)).toBe(body);
  });
});
