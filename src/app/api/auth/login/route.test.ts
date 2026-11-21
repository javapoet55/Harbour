import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ login: vi.fn() }));
vi.mock('@/server/session', () => ({ writeSession: vi.fn() }));
import { login } from '@/server/auth';
import { writeSession } from '@/server/session';
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
