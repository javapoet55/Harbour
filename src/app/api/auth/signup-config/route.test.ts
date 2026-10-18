import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './route';
afterEach(() => vi.unstubAllEnvs());
it('reports missing configuration instead of giving mobile an impossible challenge', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TURNSTILE_SITE_KEY', '');
  expect((await GET()).status).toBe(503);
});
it('returns only public configuration when configured', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TURNSTILE_SITE_KEY', 'public');
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'private'); vi.stubEnv('TURNSTILE_HOSTNAMES', 'app-dev.nexdoapp.com');
  expect(await (await GET()).json()).toEqual({ required: true, siteKey: 'public' });
});
