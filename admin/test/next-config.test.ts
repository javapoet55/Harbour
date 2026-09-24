import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('admin app configuration', () => {
  it('refuses framing, indexing and content sniffing on every route', async () => {
    const [rule] = await nextConfig.headers!();
    const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
    expect(rule.source).toBe('/:path*');
    expect(headers).toMatchObject({ 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' });
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
