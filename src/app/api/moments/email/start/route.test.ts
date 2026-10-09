import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { sessionSigningKey } from '@/server/session-key';
import { connectURL } from '@/server/moments/email';
import { GET } from './route';

const origin = 'https://app.nexdoapp.com';
const redirectUri = `${origin}/api/moments/email/callback`;

const sign = (claims: Record<string, unknown>, expires: string | number = '10m') =>
  new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(expires).sign(sessionSigningKey());
const start = (query: string) => GET(new Request(`${origin}/api/moments/email/start${query}`));
const href = (body: string, cls: string) => body.match(new RegExp(`class="${cls}" href="([^"]*)"`))?.[1].replace(/&amp;/g, '&') ?? '';

function expectGoogle(location: string | null, state: string) {
  const url = new URL(location ?? '');
  expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    client_id: 'client-id', redirect_uri: redirectUri, response_type: 'code',
    scope: 'openid email https://www.googleapis.com/auth/gmail.send', access_type: 'offline', prompt: 'consent', state,
  });
}

beforeEach(() => {
  vi.stubEnv('MOMENTS_GOOGLE_CLIENT_ID', 'client-id');
  vi.stubEnv('MOMENTS_GOOGLE_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('MOMENTS_GOOGLE_REDIRECT_URI', redirectUri);
  vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', 'true');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('Gmail OAuth start', () => {
  it('rejects a missing, forged, expired or wrong-purpose state with a plain 400', async () => {
    const states = [
      '',
      'not-a-jwt',
      await sign({ sub: 'user-1', purpose: 'moments-email' }, Math.floor(Date.now() / 1000) - 60),
      await sign({ sub: 'user-1', purpose: 'calendar-connect' }),
      await sign({ purpose: 'moments-email' }),
    ];
    for (const state of states) {
      const response = await start(`?${new URLSearchParams({ state })}`);
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(response.headers.get('location')).toBeNull();
      expect(await response.text()).toBe('This email connection link is invalid or has expired. Start again from Nexdo.');
    }
  });

  it('flag on, valid state: shows the notice, with Continue carrying the same state', async () => {
    const state = await sign({ sub: 'user-1', purpose: 'moments-email' });
    const response = await start(`?${new URLSearchParams({ state, extra: 'ignored' })}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    const body = await response.text();
    expect(body).toContain('Advanced');
    expect(body).toContain('connect your Gmail');
    expect(body).not.toContain('ignored');
    const next = new URL(href(body, 'primary'), origin);
    expect(next.pathname).toBe('/api/moments/email/start');
    expect([...next.searchParams.entries()]).toEqual([['state', state], ['ack', '1']]);
    // The existing failure deep link the apps already handle; it closes their auth browser.
    expect(href(body, 'secondary')).toBe('nexdo://moments-email?status=error');
  });

  it('ack=1: 303 to Google with the gmail.send scope and the same state', async () => {
    const state = await sign({ sub: 'user-1', purpose: 'moments-email' });
    const response = await start(`?${new URLSearchParams({ state, ack: '1' })}`);
    expect(response.status).toBe(303);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expectGoogle(response.headers.get('location'), state);
  });

  it('flag off: a valid state goes straight to Google', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', '');
    const state = await sign({ sub: 'user-1', purpose: 'moments-email' });
    const response = await start(`?${new URLSearchParams({ state })}`);
    expect(response.status).toBe(303);
    expectGoogle(response.headers.get('location'), state);
  });
});

describe('connectURL', () => {
  it('flag off: returns the Google URL exactly as before', async () => {
    vi.stubEnv('GOOGLE_OAUTH_UNVERIFIED_NOTICE', '');
    const url = await connectURL('user-1');
    const state = new URL(url).searchParams.get('state')!;
    expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: 'client-id', redirect_uri: redirectUri, response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/gmail.send', access_type: 'offline', prompt: 'consent', state }));
  });

  it('flag on: returns our start route on the redirect URI origin, and that state is accepted there', async () => {
    const url = new URL(await connectURL('user-1'));
    expect(url.origin + url.pathname).toBe(`${origin}/api/moments/email/start`);
    expect([...url.searchParams.keys()]).toEqual(['state']);
    expect((await start(url.search)).status).toBe(200);
  });
});
