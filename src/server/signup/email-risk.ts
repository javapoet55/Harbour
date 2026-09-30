import domains from './disposable-domains.json';
import { Resolver } from 'node:dns/promises';
import { domainToASCII } from 'node:url';
import { z } from 'zod';
import { log } from '@/lib/logger';

export function normalizeSignupEmail(value: string) {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf('@');
  const domain = domainToASCII(trimmed.slice(at + 1)).toLowerCase();
  const email = `${trimmed.slice(0, at)}@${domain}`;
  if (at < 1 || !domain.includes('.') || !z.email().max(254).safeParse(email).success) throw new Error('INVALID_ACCOUNT_INPUT');
  return email;
}
export type DomainResult = 'VALID' | 'INVALID' | 'UNKNOWN';
export async function checkDomain(domain: string): Promise<DomainResult> {
  const resolver = new Resolver({ timeout: 1500, tries: 1 });
  const absent = (e: unknown) => ['ENOTFOUND', 'ENODATA'].includes((e as { code?: string }).code ?? '');
  // A null MX explicitly refuses email. Missing MX alone is NOT invalid: SMTP permits A/AAAA fallback.
  try {
    const mx = await resolver.resolveMx(domain);
    if (mx.length) return mx.some(r => r.exchange && r.exchange !== '.') ? 'VALID' : 'INVALID';
  } catch (e) { if (!absent(e)) return 'UNKNOWN'; }
  const addresses = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
  if (addresses.some(r => r.status === 'fulfilled' && r.value.length)) return 'VALID';
  return addresses.every(r => r.status === 'fulfilled' || absent(r.reason)) ? 'INVALID' : 'UNKNOWN';
}

// Vendored disposable-email-domains snapshot; see DISPOSABLE-LICENSE.txt and the audit for provenance.
const disposableDomains = new Set(domains);
export function isDisposable(domain: string) {
  const parts = domain.toLowerCase().split('.');
  const extra = new Set((process.env.DISPOSABLE_EMAIL_DOMAINS ?? '').toLowerCase().split(',').map(s => s.trim()));
  return parts.slice(0, -1).some((_, i) => disposableDomains.has(parts.slice(i).join('.')) || extra.has(parts.slice(i).join('.')));
}
export type VerificationResult = { deliverability: 'VALID' | 'INVALID' | 'UNKNOWN'; disposable?: boolean };
export interface EmailVerificationProvider { verify(email: string): Promise<VerificationResult> }
export const kickbox: EmailVerificationProvider = {
  async verify(email) {
    try {
      const url = new URL('https://api.kickbox.com/v2/verify');
      url.searchParams.set('email', email);
      url.searchParams.set('apikey', process.env.EMAIL_VERIFICATION_API_KEY ?? '');
      url.searchParams.set('timeout', '3000');
      const response = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
      if (!response.ok) throw new Error('PROVIDER_UNAVAILABLE');
      const result = await response.json();
      if (result.success !== true) throw new Error('PROVIDER_UNAVAILABLE');
      return { disposable: result.disposable === true, deliverability: result.result === 'deliverable' ? 'VALID' : result.result === 'undeliverable' && ['invalid_email', 'invalid_domain', 'rejected_email'].includes(result.reason) ? 'INVALID' : 'UNKNOWN' };
    } catch { log('warn', 'signup_email_provider_unavailable'); return { deliverability: 'UNKNOWN' }; }
  },
};
export async function checkEmail(value: string, deps: { domain?: typeof checkDomain; provider?: EmailVerificationProvider } = {}) {
  const normalizedEmail = normalizeSignupEmail(value);
  const domain = normalizedEmail.split('@')[1];
  const result = { normalizedEmail, syntaxValid: true, domainValid: 'UNKNOWN' as DomainResult, disposable: isDisposable(domain), deliverability: 'UNKNOWN' as DomainResult, decision: 'ALLOW' as 'ALLOW' | 'CHALLENGE' | 'REJECT', reasonCodes: [] as string[] };
  if (result.disposable) return { ...result, decision: 'REJECT' as const, reasonCodes: ['DISPOSABLE_EMAIL'] };
  result.domainValid = await (deps.domain ?? checkDomain)(domain).catch(() => 'UNKNOWN' as const);
  if (result.domainValid === 'INVALID') return { ...result, decision: 'REJECT' as const, reasonCodes: ['INVALID_EMAIL_DOMAIN'] };
  const configured = process.env.EMAIL_VERIFICATION_PROVIDER;
  const provider = deps.provider ?? (configured === 'kickbox' ? kickbox : undefined);
  if (provider) {
    const verified = await provider.verify(normalizedEmail).catch(() => ({ deliverability: 'UNKNOWN' as const }));
    Object.assign(result, verified);
    if (result.disposable || result.deliverability === 'INVALID') return { ...result, decision: 'REJECT' as const, reasonCodes: [result.disposable ? 'DISPOSABLE_EMAIL' : 'INVALID_EMAIL_DOMAIN'] };
  }
  if (result.domainValid === 'UNKNOWN' || (provider && result.deliverability === 'UNKNOWN')) {
    result.decision = 'CHALLENGE'; result.reasonCodes.push('OTP_OWNERSHIP_REQUIRED');
  }
  return result;
}
