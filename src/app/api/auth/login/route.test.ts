import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ login: vi.fn() }));
vi.mock('@/server/session', () => ({ writeSession: vi.fn() }));
vi.mock('@/server/signup/abuse', () => ({ limitLogin: vi.fn(), clearLoginFailures: vi.fn() }));
vi.mock('@/server/health/telemetry', () => ({ healthRoute: (_name: string, handler: unknown) => handler }));
import { login } from '@/server/auth';
import { writeSession } from '@/server/session';
import { clearLoginFailures, limitLogin } from '@/server/signup/abuse';
import { POST } from './route';

type User = NonNullable<Awaited<ReturnType<typeof login>>>;
const signIn = async (email: string) => {
  vi.mocked(login).mockResolvedValue({ id: 'user-1', name: 'Alex', email, emailVerifiedAt: new Date() } as User);
  const response = await POST(new Request('http://localhost/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'secret-password' }) }));
  expect(response.status).toBe(200);
  return response.json();
};

beforeEach(() => vi.stubEnv('NEXDO_ADMIN_EMAILS', 'admin@nexdo.test'));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('where an admin lands after signing in to the main app', () => {
  it('keeps admins in the main app even when ADMIN_APP_URL is set', async () => {
    vi.stubEnv('ADMIN_APP_URL', 'https://admin.nexdo.test/');
    const body = await signIn('admin@nexdo.test');
    expect(body.admin).toBe(true);
    expect(body).not.toHaveProperty('adminAppUrl');
  });

  it('gives other users no admin flag and no admin app link', async () => {
    vi.stubEnv('ADMIN_APP_URL', 'https://admin.nexdo.test');
    const body = await signIn('person@nexdo.test');
    expect(body.admin).toBe(false);
    expect(body).not.toHaveProperty('adminAppUrl');
  });
});

describe('"Remember me"', () => {
  const signInWith = async (extra: Record<string, unknown>) => {
    vi.mocked(login).mockResolvedValue({ id: 'user-1', name: 'Alex', email: 'person@nexdo.test', emailVerifiedAt: new Date() } as User);
    const response = await POST(new Request('http://localhost/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'person@nexdo.test', password: 'secret-password', ...extra }) }));
    expect(response.status).toBe(200);
    return vi.mocked(writeSession).mock.calls.at(-1);
  };

  it('keeps the phone apps and older clients signed in: they send no choice', async () => {
    expect(await signInWith({})).toEqual(['user-1', { remember: true }]);
  });

  it('shortens the session only for an explicit false', async () => {
    expect(await signInWith({ remember: false })).toEqual(['user-1', { remember: false }]);
    expect(await signInWith({ remember: true })).toEqual(['user-1', { remember: true }]);
    for (const value of ['false', 0, null, 'no']) expect(await signInWith({ remember: value }), String(value)).toEqual(['user-1', { remember: true }]);
  });
});

describe('guessing passwords', () => {
  const attempt = (email = 'person@nexdo.test') => POST(new Request('http://localhost/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'guess' }) }));

  it('counts the attempt before checking the password', async () => {
    vi.mocked(login).mockResolvedValue(null);
    await attempt();
    expect(limitLogin).toHaveBeenCalledTimes(1);
    expect(vi.mocked(limitLogin).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(login).mock.invocationCallOrder[0]);
  });

  it('answers 429 and never checks the password once over the limit', async () => {
    vi.mocked(limitLogin).mockRejectedValue(new Error('AUTH_RATE_LIMITED'));
    const response = await attempt();
    expect(response.status).toBe(429);
    expect(login).not.toHaveBeenCalled();
    expect(writeSession).not.toHaveBeenCalled();
  });

  it('keeps counting wrong passwords and does not clear the count', async () => {
    vi.mocked(login).mockResolvedValue(null);
    expect((await attempt()).status).toBe(401);
    expect(clearLoginFailures).not.toHaveBeenCalled();
  });

  it('clears the count after the right password', async () => {
    vi.mocked(login).mockResolvedValue({ id: 'user-1', name: 'Alex', email: 'person@nexdo.test', emailVerifiedAt: new Date() } as User);
    expect((await attempt()).status).toBe(200);
    expect(clearLoginFailures).toHaveBeenCalledWith('person@nexdo.test');
  });
});
