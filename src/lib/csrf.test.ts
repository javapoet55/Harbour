import { describe, expect, it } from 'vitest';
import { crossSiteWriteReason } from './csrf';

const production = { NODE_ENV: 'production' };
const request = (method: string, headers: Record<string, string> = {}) => ({ method, headers: new Headers({ host: 'app.nexdoapp.com', ...headers }) });
const blocked = (method: string, headers: Record<string, string> = {}, env: Record<string, string | undefined> = production) => crossSiteWriteReason(request(method, headers), env) !== null;

describe('cross-site write protection', () => {
  it('never interferes with reads', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(blocked(method, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).toBe(false);
  });

  it("lets the app's own pages write", () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(blocked(method, { 'sec-fetch-site': 'same-origin', origin: 'https://app.nexdoapp.com' })).toBe(false);
      // Browsers that send Origin but not Sec-Fetch-Site (older Safari).
      expect(blocked(method, { origin: 'https://app.nexdoapp.com' })).toBe(false);
    }
  });

  it('lets the phone apps, workers and webhooks through: they send neither browser header', () => {
    expect(blocked('POST')).toBe(false);
    expect(blocked('DELETE', { cookie: 'harbor_session=x', 'user-agent': 'okhttp/4.12.0' })).toBe(false);
    expect(blocked('POST', { 'x-twilio-signature': 'abc', 'content-type': 'application/x-www-form-urlencoded' })).toBe(false);
  });

  it('refuses writes that another site made the browser send', () => {
    expect(blocked('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })).toBe(true);
    expect(blocked('POST', { origin: 'https://evil.example' })).toBe(true);
    expect(blocked('DELETE', { 'sec-fetch-site': 'cross-site' })).toBe(true);
    // A classic auto-submitting form from a sandboxed frame or after a redirect.
    expect(blocked('POST', { 'sec-fetch-site': 'cross-site', origin: 'null' })).toBe(true);
    expect(blocked('POST', { origin: 'null' })).toBe(true);
  });

  it('refuses sibling subdomains, which SameSite cookies alone would trust', () => {
    for (const origin of ['https://www.nexdoapp.com', 'https://admin.nexdoapp.com', 'https://app-dev.nexdoapp.com']) {
      expect(blocked('POST', { 'sec-fetch-site': 'same-site', origin })).toBe(true);
    }
    expect(blocked('POST', { 'sec-fetch-site': 'same-site' })).toBe(true);
  });

  it('refuses look-alike hosts and a plain-http copy of the app in production', () => {
    for (const origin of ['https://app.nexdoapp.com.evil.example', 'https://evil.example/app.nexdoapp.com', 'https://app.nexdoapp.com:8443', 'http://app.nexdoapp.com', 'javascript:alert(1)', 'not a url']) {
      expect(blocked('POST', { origin }), origin).toBe(true);
    }
  });

  it('accepts the public host when a proxy forwards it', () => {
    const viaProxy = { method: 'POST', headers: new Headers({ host: 'internal:8080', 'x-forwarded-host': 'app.nexdoapp.com', origin: 'https://app.nexdoapp.com' }) };
    expect(crossSiteWriteReason(viaProxy, production)).toBeNull();
  });

  it('allows plain http only for local development', () => {
    const local = (env: Record<string, string>) => crossSiteWriteReason({ method: 'POST', headers: new Headers({ host: '127.0.0.1:43217', origin: 'http://127.0.0.1:43217' }) }, env);
    expect(local({ NODE_ENV: 'development' })).toBeNull();
    expect(local(production)).toBeNull(); // `next start` on a developer machine.
    expect(blocked('POST', { origin: 'http://app.nexdoapp.com' }, { NODE_ENV: 'development' })).toBe(false);
  });

  it('allows a user-initiated request that no site can cause', () => {
    expect(blocked('POST', { 'sec-fetch-site': 'none' })).toBe(false);
    expect(blocked('POST', { 'sec-fetch-site': 'none', origin: 'https://evil.example' })).toBe(true);
  });

  it('accepts only exact origins from APP_URL and CSRF_TRUSTED_ORIGINS', () => {
    const env = { ...production, APP_URL: 'https://nexdo.example/', CSRF_TRUSTED_ORIGINS: ' https://partner.example , not-a-url,' };
    expect(blocked('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://nexdo.example' }, env)).toBe(false);
    expect(blocked('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://partner.example' }, env)).toBe(false);
    expect(blocked('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://sub.partner.example' }, env)).toBe(true);
    expect(blocked('POST', { 'sec-fetch-site': 'cross-site', origin: 'http://partner.example' }, env)).toBe(true);
  });

  it('says why, without echoing an unbounded header', () => {
    expect(crossSiteWriteReason(request('POST', { origin: 'https://evil.example' }), production)).toBe('origin:https://evil.example');
    expect(crossSiteWriteReason(request('POST', { 'sec-fetch-site': 'cross-site' }), production)).toBe('sec-fetch-site:cross-site');
    expect(crossSiteWriteReason(request('POST', { origin: `https://${'a'.repeat(5000)}.example` }), production)!.length).toBeLessThanOrEqual(207);
  });
});
