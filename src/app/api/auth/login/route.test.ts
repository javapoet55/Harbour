import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ login: vi.fn() }));
vi.mock('@/server/session', () => ({ writeSession: vi.fn() }));
import { login } from '@/server/auth';
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
