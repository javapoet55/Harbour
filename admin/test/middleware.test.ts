import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware } from '@/middleware';
import { contentSecurityPolicy } from '@/lib/csp';

const visit = (path: string, headers: Record<string, string> = {}) => middleware(new NextRequest(`http://localhost${path}`, { headers }));
const nonceOf = (response: Response) => /'nonce-([^']+)'/.exec(response.headers.get('content-security-policy') ?? '')?.[1];

describe('admin page content security policy', () => {
  it('gives every page its own nonce and hands it to the renderer', () => {
    const [first, second] = [visit('/users'), visit('/users')];
    expect(nonceOf(first)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonceOf(first)).not.toBe(nonceOf(second));
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(first));
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(first.headers.get('content-security-policy'));
    expect(visit('/users', { 'x-nonce': 'attacker' }).headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
  });

  it('runs only nonced scripts, loads nothing from other hosts and refuses all framing', () => {
    const policy = contentSecurityPolicy('abc', { development: false });
    const scripts = policy.split('; ').find((part) => part.startsWith('script-src '))!;
    expect(scripts).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy).not.toMatch(/https?:/);
    for (const part of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'", 'upgrade-insecure-requests']) expect(policy.split('; ')).toContain(part);
    expect(contentSecurityPolicy('abc', { development: true })).toContain("'unsafe-eval'");
  });

  it('covers pages and leaves API routes and build files to the static headers', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ['/', '/login', '/users/user-1', '/bug-reports']) expect(matcher.test(path), path).toBe(true);
    for (const path of ['/api/admin/auth', '/_next/static/chunk.js', '/_next/image', '/favicon.ico']) expect(matcher.test(path), path).toBe(false);
  });
});
