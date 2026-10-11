import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/account-auth', () => ({ createPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock('@/server/signup/abuse', () => ({ limitAuthRequest: vi.fn() }));
vi.mock('@/server/health/telemetry', () => ({ healthRoute: (_name: string, handler: unknown) => handler }));

import { createPasswordReset, resetPassword } from '@/server/account-auth';
import { limitAuthRequest } from '@/server/signup/abuse';
import { POST as requestCode } from './request/route';
import { POST as confirmReset } from './confirm/route';

const credentials = { email: 'person@example.com', code: '012345', password: 'new-secure-password' };
const request = (body: unknown) => new Request('http://localhost/api/auth/password-reset', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(limitAuthRequest).mockResolvedValue(undefined);
  vi.mocked(createPasswordReset).mockResolvedValue({ delivered: true });
  vi.mocked(resetPassword).mockResolvedValue(undefined);
});

describe('password recovery API boundaries', () => {
  it('requests a code without requiring a session and returns the generic acknowledgement', async () => {
    const req = request({ email: credentials.email });
    const response = await requestCode(req);
    expect(limitAuthRequest).toHaveBeenCalledWith(req, 'send');
    expect(createPasswordReset).toHaveBeenCalledTimes(1);
    expect(createPasswordReset).toHaveBeenCalledWith(credentials.email);
    expect(vi.mocked(limitAuthRequest).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createPasswordReset).mock.invocationCallOrder[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'If that account exists, a six-digit code has been sent.', delivered: true });
  });

  it('passes a leading-zero code intact and does not issue a session after resetting', async () => {
    const req = request(credentials);
    const response = await confirmReset(req);
    expect(limitAuthRequest).toHaveBeenCalledWith(req, 'verify');
    expect(resetPassword).toHaveBeenCalledTimes(1);
    expect(resetPassword).toHaveBeenCalledWith(credentials);
    expect(vi.mocked(limitAuthRequest).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(resetPassword).mock.invocationCallOrder[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  for (const [name, handler, service] of [
    ['request', requestCode, createPasswordReset], ['confirm', confirmReset, resetPassword],
  ] as const) {
    describe(name, () => {
      it.each(['AUTH_RATE_LIMITED', 'SIGNUP_SECURITY_UNAVAILABLE'])('blocks work when the limiter rejects with %s', async (error) => {
        vi.mocked(limitAuthRequest).mockRejectedValue(new Error(error));
        const response = await handler(request(credentials));
        expect(response.status).toBe(error === 'AUTH_RATE_LIMITED' ? 429 : 503);
        expect(service).not.toHaveBeenCalled();
      });

      it('does not expose internal exception details', async () => {
        vi.mocked(service).mockRejectedValue(new Error('private database connection details'));
        const response = await handler(request(credentials));
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Request failed.' });
      });

      it('handles malformed JSON as invalid account input', async () => {
        vi.mocked(service).mockRejectedValue(new Error('INVALID_ACCOUNT_INPUT'));
        const response = await handler(new Request('http://localhost', { method: 'POST', body: '{' }));
        expect(response.status).toBe(400);
        if (name === 'request') expect(createPasswordReset).toHaveBeenCalledWith('');
        else expect(resetPassword).toHaveBeenCalledWith({ email: '', code: '', password: '' });
      });
    });
  }

  it('returns a retryable response when email delivery fails', async () => {
    vi.mocked(createPasswordReset).mockRejectedValue(new Error('EMAIL_UNAVAILABLE'));
    const response = await requestCode(request(credentials));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('try again');
  });

  it.each(['INVALID_RESET_CODE', 'PASSWORD_POLICY', 'INVALID_ACCOUNT_INPUT'])('rejects confirmation with %s without reporting success', async (error) => {
    vi.mocked(resetPassword).mockRejectedValue(new Error(error));
    const response = await confirmReset(request(credentials));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('ok');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
