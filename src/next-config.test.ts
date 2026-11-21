import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('security headers on every response', () => {
  it('refuse framing by other sites, content sniffing and plain http', async () => {
    const [all] = await nextConfig.headers!();
    const headers = Object.fromEntries(all.headers.map(({ key, value }) => [key, value]));
    expect(all.source).toBe('/:path*');
    expect(headers).toMatchObject({ 'X-Frame-Options': 'SAMEORIGIN', 'X-Content-Type-Options': 'nosniff' });
    expect(headers['Strict-Transport-Security']).toMatch(/^max-age=\d{8,}$/);
    expect(headers['Permissions-Policy']).toContain('microphone=(self)');
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('never replace a header an API route sets for itself', async () => {
    // Headers from next.config win over a route's own. The OAuth routes send "Referrer-Policy: no-referrer"
    // and their own Content-Security-Policy, so neither may be set for /api here.
    const rules = await nextConfig.headers!();
    const pattern = (source: string) => new RegExp(`^${source.replace('/:path*', '(/.*)?')}$`);
    const forApi = rules.filter((rule) => pattern(rule.source).test('/api/calendar/oauth/google/start')).flatMap((rule) => rule.headers.map(({ key }) => key));
    expect(forApi).not.toContain('Referrer-Policy');
    expect(forApi).not.toContain('Content-Security-Policy');
    const forPages = rules.filter((rule) => pattern(rule.source).test('/tasks')).flatMap((rule) => rule.headers.map(({ key }) => key));
    expect(forPages).toContain('Referrer-Policy');
  });
});
