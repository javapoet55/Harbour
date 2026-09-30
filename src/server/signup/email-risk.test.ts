import { afterEach, describe, expect, it, vi } from 'vitest';
const dns = vi.hoisted(() => ({ resolveMx: vi.fn(), resolve4: vi.fn(), resolve6: vi.fn() }));
vi.mock('node:dns/promises', () => ({ Resolver: class { resolveMx = dns.resolveMx; resolve4 = dns.resolve4; resolve6 = dns.resolve6; } }));
import { checkDomain, checkEmail, kickbox, normalizeSignupEmail } from './email-risk';
import { clientAddress, verifyBot } from './abuse';
import { promotionMailbox } from './promotion';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('email risk', () => {
  it.each(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'company.com', 'stanford.edu'])('permits %s and plus addressing', async domain => {
    expect(await checkEmail(`Person+shopping@${domain}`, { domain: async () => 'VALID' })).toMatchObject({ normalizedEmail: `Person+shopping@${domain}`, decision: 'ALLOW' });
  });
  it('normalizes domain without changing local part', () => expect(normalizeSignupEmail(' Person+Tag@GMAIL.COM ')).toBe('Person+Tag@gmail.com'));
  it.each(['', 'abc', 'x@', 'a@localhost', 'a..b@gmail.com', 'a@-invalid.com', 'a'.repeat(255)+'@gmail.com'])('rejects malformed %s', email => expect(() => normalizeSignupEmail(email)).toThrow());
  it.each(['mailinator.com', 'sub.yopmail.com', 'guerrillamail.com'])('rejects disposable %s before DNS', async domain => {
    const lookup = vi.fn(); expect(await checkEmail(`x@${domain}`, { domain: lookup })).toMatchObject({ decision: 'REJECT', disposable: true }); expect(lookup).not.toHaveBeenCalled();
  });
  it('rejects nonexistent domain', async () => expect(await checkEmail('x@missing.example', { domain: async () => 'INVALID' })).toMatchObject({ decision: 'REJECT' }));
  it('challenges temporary DNS failure with existing OTP', async () => expect(await checkEmail('x@company.com', { domain: async () => 'UNKNOWN' })).toMatchObject({ decision: 'CHALLENGE' }));
  it('allows A fallback with no MX', async () => { dns.resolveMx.mockRejectedValue({ code: 'ENODATA' }); dns.resolve4.mockResolvedValue(['1.2.3.4']); dns.resolve6.mockRejectedValue({ code: 'ENODATA' }); expect(await checkDomain('company.com')).toBe('VALID'); });
  it('rejects null MX', async () => { dns.resolveMx.mockResolvedValue([{ exchange: '', priority: 0 }]); expect(await checkDomain('company.com')).toBe('INVALID'); });
  it('rejects definitive DNS absence', async () => { for (const fn of Object.values(dns)) fn.mockRejectedValue({ code: 'ENOTFOUND' }); expect(await checkDomain('missing.example')).toBe('INVALID'); });
  it('handles DNS timeout', async () => { dns.resolveMx.mockRejectedValue({ code: 'ETIMEOUT' }); expect(await checkDomain('company.com')).toBe('UNKNOWN'); });
  it.each([429, 500])('handles provider HTTP %s', async status => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status }))); expect(await kickbox.verify('x@company.com')).toEqual({ deliverability: 'UNKNOWN' }); });
  it('handles provider timeout', async () => { vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout'))); expect(await kickbox.verify('x@company.com')).toEqual({ deliverability: 'UNKNOWN' }); });
  it('rejects high confidence invalid mailbox', async () => expect(await checkEmail('x@company.com', { domain: async () => 'VALID', provider: { verify: async () => ({ deliverability: 'INVALID' }) } })).toMatchObject({ decision: 'REJECT' }));
  it('provider failure falls back to OTP', async () => expect(await checkEmail('x@company.com', { domain: async () => 'VALID', provider: { verify: async () => { throw new Error(); } } })).toMatchObject({ decision: 'CHALLENGE' }));
  it('canonicalizes only Gmail promotions, not account identities', () => { expect(promotionMailbox('A.B+tag@googlemail.com')).toBe('ab@gmail.com'); expect(promotionMailbox('A.B+tag@company.com')).toBe('A.B+tag@company.com'); });
});
describe('server bot verification', () => {
  function setup() { vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('SIGNUP_ABUSE_SECRET', 'test-abuse-key-not-production-1234567890'); vi.stubEnv('TURNSTILE_SECRET_KEY', 'real-secret'); vi.stubEnv('TURNSTILE_HOSTNAMES', 'app.nexdoapp.com'); }
  it('rejects missing token in production', async () => { setup(); await expect(verifyBot(undefined)).rejects.toThrow('BOT_CHECK_FAILED'); });
  it('fails closed without configuration', async () => { setup(); vi.stubEnv('TURNSTILE_SECRET_KEY', ''); await expect(verifyBot('token')).rejects.toThrow('SIGNUP_SECURITY_UNAVAILABLE'); });
  it.each([{ success: false }, { success: true, action: 'other', hostname: 'app.nexdoapp.com' }, { success: true, action: 'signup', hostname: 'evil.example' }])('rejects invalid/foreign challenge', async result => { setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result))); await expect(verifyBot('token')).rejects.toThrow('BOT_CHECK_FAILED'); });
  it('accepts verified signup challenge', async () => { setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, action: 'signup', hostname: 'app.nexdoapp.com' }))); await expect(verifyBot('token')).resolves.toBeUndefined(); });
  it('fails closed on network failure', async () => { setup(); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error())); await expect(verifyBot('token')).rejects.toThrow('SIGNUP_SECURITY_UNAVAILABLE'); });
  it('does not trust arbitrary forwarding headers', () => { setup(); vi.stubEnv('AUTH_TRUSTED_IP_HEADER', 'x-client-ip'); expect(() => clientAddress(new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4' } }))).toThrow(); });
  it('groups IPv6 /64 aliases', () => { vi.stubEnv('AUTH_TRUSTED_IP_HEADER', 'x-client-ip'); const ip = (value: string) => clientAddress(new Request('https://x', { headers: { 'x-client-ip': value } })); expect(ip('2001:db8::1')).toBe(ip('2001:0db8:0:0::ffff')); });
});
