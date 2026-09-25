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
