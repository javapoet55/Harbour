import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/server/health/telemetry', () => ({ observedFetch: vi.fn() }));
vi.mock('@/server/db', () => ({ prisma: {} }));
vi.mock('@/lib/credentials', () => ({ encryptCredential: vi.fn((value: string) => `encrypted:${value}`), decryptCredential: vi.fn() }));
import { encryptCredential } from '@/lib/credentials';
import { observedFetch } from '@/server/health/telemetry';
import { connect, connectURL } from './email';
let state: string;
beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked(encryptCredential).mockImplementation(value => `encrypted:${value}`);
  vi.stubEnv('MOMENTS_GOOGLE_CLIENT_ID', 'test');
  vi.stubEnv('MOMENTS_GOOGLE_CLIENT_SECRET', 'test');
  vi.stubEnv('MOMENTS_GOOGLE_REDIRECT_URI', 'https://nexdo.test/callback');
  state = new URL(await connectURL('owner')).searchParams.get('state')!;
});
afterEach(() => vi.unstubAllEnvs());
it.each([undefined, '', 'openid email', 'https://www.googleapis.com/auth/gmail.send.extra'])('rejects missing Gmail send consent (%s)', async scope => {
  vi.mocked(observedFetch).mockResolvedValueOnce(Response.json({ access_token: 'access', refresh_token: 'refresh', scope }));
  await expect(connect('code', state)).rejects.toThrow('approve permission');
  expect(observedFetch).toHaveBeenCalledTimes(1);
});
it('issues an encrypted confirmation ticket only after send consent and verified email', async () => {
  vi.mocked(observedFetch).mockResolvedValueOnce(Response.json({ access_token: 'access', refresh_token: 'refresh', scope: 'openid email https://www.googleapis.com/auth/gmail.send' }))
    .mockResolvedValueOnce(Response.json({ email: 'owner@example.com', email_verified: true }));
  expect(await connect('code', state)).toContain('encrypted:');
  expect(observedFetch).toHaveBeenCalledTimes(2);
});
it('rejects forged state without contacting Google', async () => {
  await expect(connect('code', 'forged')).rejects.toThrow();
  expect(observedFetch).not.toHaveBeenCalled();
});

it('rejects missing offline consent before reading the account or creating a ticket', async () => {
  vi.mocked(observedFetch).mockResolvedValueOnce(Response.json({ access_token: 'access', scope: 'https://www.googleapis.com/auth/gmail.send' }));
  await expect(connect('code', state)).rejects.toThrow('offline email access');
  expect(observedFetch).toHaveBeenCalledTimes(1);
  expect(encryptCredential).not.toHaveBeenCalled();
});
it('rejects an unverified Google account without issuing a connection ticket', async () => {
  vi.mocked(observedFetch).mockResolvedValueOnce(Response.json({ access_token: 'access', refresh_token: 'refresh', scope: 'https://www.googleapis.com/auth/gmail.send' }))
    .mockResolvedValueOnce(Response.json({ email: 'owner@example.com', email_verified: false }));
  await expect(connect('code', state)).rejects.toThrow('Unable to verify email account');
  expect(encryptCredential).not.toHaveBeenCalled();
});
