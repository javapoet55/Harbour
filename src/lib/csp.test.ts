import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, createNonce, cspHeaderName } from './csp';

const directive = (policy: string, name: string) => policy.split('; ').find((part) => part.startsWith(`${name} `) || part === name);

describe('content security policy', () => {
  const policy = contentSecurityPolicy('abc123', { development: false });

  it('runs only scripts that carry the nonce or are loaded by one that does', () => {
    const scripts = directive(policy, 'script-src')!;
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts).not.toMatch(/\s(\*|https:|data:|blob:)(\s|$)/);
  });

  it('blocks plugins, foreign form targets, base-tag hijacking and framing by other sites', () => {
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'self'");
    expect(directive(policy, 'default-src')).toBe("default-src 'self'");
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('allows only the sign-up bot check as a third party', () => {
    const hosts = policy.match(/https:\/\/[^\s;]+/g) ?? [];
    expect([...new Set(hosts)]).toEqual(['https://challenges.cloudflare.com']);
  });

  it('relaxes only what the development server needs', () => {
    const development = contentSecurityPolicy('abc123', { development: true });
    expect(directive(development, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(development, 'connect-src')).toContain('ws:');
    expect(development).not.toContain('upgrade-insecure-requests');
  });

  it('makes a different nonce every time', () => {
    const nonces = new Set(Array.from({ length: 200 }, createNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it('enforces unless CSP_REPORT_ONLY is exactly "true"', () => {
    expect(cspHeaderName({})).toBe('Content-Security-Policy');
    expect(cspHeaderName({ CSP_REPORT_ONLY: 'false' })).toBe('Content-Security-Policy');
    expect(cspHeaderName({ CSP_REPORT_ONLY: 'true' })).toBe('Content-Security-Policy-Report-Only');
  });
});
