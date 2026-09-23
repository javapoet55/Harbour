import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './db';
import { syncConnection } from './calendar-sync';
import { encryptCredential } from '@/lib/credentials';
import { CalendarAuthError, OAuthTokenError, isCalendarAuthFailure } from '@/providers/calendar';

// The real provider code runs; only the network is stubbed. Every connection's access token has expired,
// so each sync first refreshes it at the provider's token endpoint.
let userId = '';
const tokenUrls = ['https://oauth2.googleapis.com/token', 'https://login.microsoftonline.com/common/oauth2/v2.0/token'];

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `${randomUUID()}@nexdo.test`, name: 'Calendar Auth', passwordHash: '', timeZone: 'UTC' } })).id;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await prisma.user.delete({ where: { id: userId } }); });

function env() {
  for (const provider of ['GOOGLE', 'MICROSOFT']) {
    vi.stubEnv(`${provider}_CALENDAR_CLIENT_ID`, 'client');
    vi.stubEnv(`${provider}_CALENDAR_CLIENT_SECRET`, 'secret');
    vi.stubEnv(`${provider}_CALENDAR_REDIRECT_URI`, 'https://nexdo.test/callback');
  }
}
async function connection(provider: 'google' | 'microsoft', refreshToken: string | null = 'refresh-token') {
  return prisma.calendarConnection.create({ data: {
    userId, provider, accountEmail: 'owner@nexdo.test', calendarId: randomUUID(), calendarName: 'Work',
    accessToken: encryptCredential('stale-access'), refreshToken: encryptCredential(refreshToken), tokenExpiresAt: new Date(Date.now() - 60_000),
    status: 'connected', lastSyncedAt: new Date('2026-09-01T00:00:00Z'),
  } });
}
/** Token endpoint answers `token`; the calendar listing (if reached) is empty. */
function network(token: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (tokenUrls.some((token) => url.startsWith(token))) return token();
    if (url.startsWith('https://www.googleapis.com/calendar/v3/')) return Response.json({ items: [], nextSyncToken: 'sync-1' });
    if (url.startsWith('https://graph.microsoft.com/')) return Response.json({ value: [], '@odata.deltaLink': 'https://graph.microsoft.com/delta?token=1' });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const status = async (id: string) => (await prisma.calendarConnection.findUniqueOrThrow({ where: { id } })).status;

describe('auth failures while opening a calendar', () => {
  it('marks a revoked Google grant as error', async () => {
    env();
    network(() => Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 }));
    const c = await connection('google');
    await expect(syncConnection(userId, c.id)).rejects.toThrow('Token has been expired or revoked.');
    expect(await status(c.id)).toBe('error');
  });

  it('marks a missing refresh token as error without calling the provider', async () => {
    env();
    const fetch = network(() => Response.json({ access_token: 'unused' }));
    const c = await connection('google', null);
    await expect(syncConnection(userId, c.id)).rejects.toThrow('reconnect the account');
    expect(await status(c.id)).toBe('error');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['expired (AADSTS70008)', 'invalid_grant', 'AADSTS70008: The provided authorization code or refresh token has expired due to inactivity.'],
    ['revoked (AADSTS50173)', 'invalid_grant', 'AADSTS50173: The provided grant has expired due to it being revoked.'],
    ['needs MFA (AADSTS50076)', 'interaction_required', 'AADSTS50076: Due to a configuration change made by your administrator, you must use multi-factor authentication.'],
  ])('marks a Microsoft grant that is %s as error', async (_label, error, description) => {
    env();
    network(() => Response.json({ error, error_description: description }, { status: 400 }));
    const c = await connection('microsoft');
    await expect(syncConnection(userId, c.id)).rejects.toThrow('AADSTS');
    expect(await status(c.id)).toBe('error');
  });
});

describe('transient failures leave the status alone', () => {
  it.each([
    ['a network error', () => { throw new TypeError('fetch failed'); }],
    ['a timeout', () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }],
    ['a 5xx with JSON', () => Response.json({ error: 'server_error', error_description: 'Backend Error' }, { status: 503 })],
    ['a 5xx with an HTML page', () => new Response('<html>Bad Gateway</html>', { status: 502 })],
    ['rate limiting', () => Response.json({ error: 'rate_limit_exceeded' }, { status: 429 })],
    ['a misconfigured Nexdo client', () => Response.json({ error: 'invalid_client', error_description: 'The OAuth client was not found.' }, { status: 401 })],
  ])('%s', async (_label, token) => {
    env();
    network(token as () => Response);
    const c = await connection('google');
    await expect(syncConnection(userId, c.id)).rejects.toThrow();
    expect(await status(c.id)).toBe('connected');
    expect((await prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } })).lastSyncedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
  });

  it('keeps an existing error status on a transient failure', async () => {
    env();
    network(() => new Response('unavailable', { status: 503 }));
    const c = await connection('google');
    await prisma.calendarConnection.update({ where: { id: c.id }, data: { status: 'error' } });
    await expect(syncConnection(userId, c.id)).rejects.toThrow();
    expect(await status(c.id)).toBe('error');
  });
});

describe('recovering', () => {
  it('returns to connected on the next successful sync', async () => {
    env();
    network(() => Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 }));
    const c = await connection('google');
    await expect(syncConnection(userId, c.id)).rejects.toThrow();
    expect(await status(c.id)).toBe('error');

    // After reconnecting (new refresh token) the provider accepts it again.
    await prisma.calendarConnection.update({ where: { id: c.id }, data: { refreshToken: encryptCredential('new-refresh') } });
    network(() => Response.json({ access_token: 'fresh', expires_in: 3600 }));
    const before = Date.now();
    await expect(syncConnection(userId, c.id)).resolves.toMatchObject({ created: 0, updated: 0, deleted: 0 });
    const saved = await prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } });
    expect(saved.status).toBe('connected');
    expect(saved.lastSyncedAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('recovers a Microsoft connection the same way', async () => {
    env();
    network(() => Response.json({ error: 'invalid_grant', error_description: 'AADSTS50173: revoked' }, { status: 400 }));
    const c = await connection('microsoft');
    await expect(syncConnection(userId, c.id)).rejects.toThrow();
    expect(await status(c.id)).toBe('error');
    network(() => Response.json({ access_token: 'fresh', expires_in: 3600 }));
    await syncConnection(userId, c.id);
    expect(await status(c.id)).toBe('connected');
  });
});

describe('isCalendarAuthFailure', () => {
  it('only treats a dead grant as an auth failure', () => {
    expect(isCalendarAuthFailure(new CalendarAuthError('missing'))).toBe(true);
    expect(isCalendarAuthFailure(new OAuthTokenError('revoked', 400, 'invalid_grant'))).toBe(true);
    expect(isCalendarAuthFailure(new OAuthTokenError('consent', 400, 'consent_required'))).toBe(true);
    expect(isCalendarAuthFailure(new OAuthTokenError('login', 400, 'login_required'))).toBe(true);
    expect(isCalendarAuthFailure(new OAuthTokenError('busy', 503, 'invalid_grant'))).toBe(false);
    expect(isCalendarAuthFailure(new OAuthTokenError('slow down', 429, 'invalid_grant'))).toBe(false);
    expect(isCalendarAuthFailure(new OAuthTokenError('config', 401, 'invalid_client'))).toBe(false);
    expect(isCalendarAuthFailure(new OAuthTokenError('no code', 400, undefined))).toBe(false);
    expect(isCalendarAuthFailure(new OAuthTokenError('no access token', 200, undefined))).toBe(false);
    expect(isCalendarAuthFailure(new Error('Token has been expired or revoked.'))).toBe(false);
    expect(isCalendarAuthFailure(Object.assign(new Error('Calendar provider returned 401'), { status: 401 }))).toBe(false);
  });
});
