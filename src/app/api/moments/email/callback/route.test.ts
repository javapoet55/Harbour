import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/server/moments/email', () => ({ connect: vi.fn() }));
vi.mock('@/server/health/telemetry', () => ({ healthRoute: (_name: string, handler: unknown) => handler }));
import { connect } from '@/server/moments/email';
import { GET } from './route';
beforeEach(() => vi.resetAllMocks());
it.each(['?error=access_denied&state=valid', '?state=valid', '?code=value', '?error=access_denied&state=valid&code=value'])('does not exchange credentials for a cancelled or incomplete callback %s', async query => {
  const response = await GET(new Request(`https://nexdo.test/callback${query}`));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('nexdo://moments-email?status=error');
  expect(connect).not.toHaveBeenCalled();
});
it('returns a confirmation ticket without exposing provider errors', async () => {
  vi.mocked(connect).mockRejectedValue(new Error('private provider token'));
  const response = await GET(new Request('https://nexdo.test/callback?code=value&state=valid'));
  expect(response.headers.get('location')).toBe('nexdo://moments-email?status=error');
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('encodes the successful ticket for app confirmation', async () => {
  vi.mocked(connect).mockResolvedValue('ticket+/?');
  const response = await GET(new Request('https://nexdo.test/callback?code=value&state=valid'));
  const destination = new URL(response.headers.get('location')!);
  expect(destination.searchParams.get('status')).toBe('confirm');
  expect(destination.searchParams.get('ticket')).toBe('ticket+/?');
});
