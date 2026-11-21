import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

afterEach(() => vi.unstubAllEnvs());

describe('expired session navigation', () => {
  it('leaves authentication failures to JSON APIs instead of redirecting to an HTML login', () => {
    expect(middleware(new NextRequest('http://localhost/api/assistant')).headers.get('location')).toBeNull();
  });
  it('never treats the mere existence of an invalid cookie as a reason to leave login', () => {
    expect(middleware(new NextRequest('http://localhost/login', { headers: { cookie: 'harbor_session=expired' } })).headers.get('location')).toBeNull();
    expect(middleware(new NextRequest('http://localhost/tasks')).headers.get('location')).toBe('http://localhost/login');
  });
});

describe('retired /admin pages', () => {
  const visit = (path: string, cookie?: string) => middleware(new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie } } : {}));

  it('permanently redirects to the same page in the admin app, keeping the query string', () => {
    vi.stubEnv('ADMIN_APP_URL', 'https://admin.nexdo.test');
    const cases = {
      '/admin': 'https://admin.nexdo.test/',
      '/admin/': 'https://admin.nexdo.test/',
      '/admin/users': 'https://admin.nexdo.test/users',
      '/admin/users/user-1?from=2026-09-01&to=2026-09-25': 'https://admin.nexdo.test/users/user-1?from=2026-09-01&to=2026-09-25',
      '/admin/login': 'https://admin.nexdo.test/login',
      '/admin/health?range=24H': 'https://admin.nexdo.test/health?range=24H',
    };
    for (const [path, target] of Object.entries(cases)) {
      const response = visit(path);
      expect(response.status, path).toBe(308);
      expect(response.headers.get('location'), path).toBe(target);
    }
    // Signed-in or not, the redirect comes first; nobody is sent to the app's /login instead.
    expect(visit('/admin/voice', 'harbor_session=valid').headers.get('location')).toBe('https://admin.nexdo.test/voice');
  });

  it('keeps a path prefix on ADMIN_APP_URL and tolerates a trailing slash', () => {
    vi.stubEnv('ADMIN_APP_URL', 'https://ops.nexdo.test/portal/');
    expect(visit('/admin/revenue?x=1').headers.get('location')).toBe('https://ops.nexdo.test/portal/revenue?x=1');
  });

  it('returns 404 when ADMIN_APP_URL is unset, blank or not an http(s) URL', () => {
    for (const value of [undefined, '', '   ', 'not a url', 'javascript:alert(1)']) {
      vi.stubEnv('ADMIN_APP_URL', value ?? '');
      if (value === undefined) delete process.env.ADMIN_APP_URL; // Restored by unstubAllEnvs.
      const response = visit('/admin/users');
      expect(response.status, String(value)).toBe(404);
      expect(response.headers.get('location')).toBeNull();
    }
  });

  it('matches only /admin and /admin/*, never /api/admin or look-alike paths', () => {
    vi.stubEnv('ADMIN_APP_URL', 'https://admin.nexdo.test');
    const api = visit('/api/admin/snapshot');
    expect(api.status).toBe(200);
    expect(api.headers.get('location')).toBeNull();
    expect(visit('/administrator').headers.get('location')).toBe('http://localhost/login');
    expect(visit('/admins/list').headers.get('location')).toBe('http://localhost/login');
  });
});

describe('cross-site writes', () => {
  const send = (path: string, method: string, headers: Record<string, string> = {}) => middleware(new NextRequest(`http://localhost${path}`, { method, headers }));

  it('refuses a write another site made the browser send, before any route runs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const path of ['/api/tasks', '/api/auth/login', '/api/account', '/api/auth/logout-everywhere']) {
      const response = send(path, path === '/api/account' ? 'DELETE' : 'POST', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', cookie: 'harbor_session=valid' });
      expect(response.status, path).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'CROSS_SITE_REQUEST' });
    }
    expect(warn).toHaveBeenCalledTimes(4);
    expect(String(warn.mock.calls[0][0])).toContain('csrf.blocked');
    warn.mockRestore();
  });

  it("lets the app's own pages and the phone apps write", () => {
    expect(send('/api/tasks', 'POST', { origin: 'http://localhost', 'sec-fetch-site': 'same-origin' }).status).toBe(200);
    expect(send('/api/tasks', 'POST', { cookie: 'harbor_session=valid' }).status).toBe(200);
    expect(send('/api/moments/tick', 'POST', { authorization: 'Bearer cron' }).status).toBe(200);
  });

  it('never blocks a read, wherever it comes from', () => {
    expect(send('/api/tasks', 'GET', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }).status).toBe(200);
  });
});

describe('page content security policy', () => {
  const visit = (path: string, cookie = 'harbor_session=valid') => middleware(new NextRequest(`http://localhost${path}`, { headers: { cookie } }));
  const nonceOf = (response: Response) => /'nonce-([^']+)'/.exec(response.headers.get('content-security-policy') ?? '')?.[1];

  it('gives every page a policy with its own nonce and hands the nonce to the renderer', () => {
    const first = visit('/tasks');
    const second = visit('/tasks');
    expect(nonceOf(first)).toBeTruthy();
    expect(nonceOf(first)).not.toBe(nonceOf(second));
    // NextResponse.next({ request }) forwards overridden request headers under this prefix.
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(first));
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(first.headers.get('content-security-policy'));
  });

  it('covers public pages too: login, sign-up and shared links', () => {
    for (const path of ['/login', '/signup', '/welcome', '/s/abc', '/shared/shopping/abc']) expect(nonceOf(visit(path, '')), path).toBeTruthy();
  });

  it('never trusts a nonce sent by the client', () => {
    const response = middleware(new NextRequest('http://localhost/tasks', { headers: { cookie: 'harbor_session=valid', 'x-nonce': 'attacker' } }));
    expect(response.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
  });

  it('leaves JSON APIs and files alone', () => {
    for (const path of ['/api/tasks', '/manifest.json', '/sw.js']) expect(visit(path).headers.get('content-security-policy'), path).toBeNull();
  });

  it('only reports when CSP_REPORT_ONLY is true', () => {
    vi.stubEnv('CSP_REPORT_ONLY', 'true');
    const response = visit('/tasks');
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(response.headers.get('content-security-policy-report-only')).toContain("'strict-dynamic'");
  });
});
