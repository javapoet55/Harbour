import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarConnection } from '@/generated/prisma';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() }));
vi.mock('@/server/health/telemetry', () => ({ observedFetch: mocks.fetch }));
vi.mock('@/server/db', () => ({ prisma: { user: { findUniqueOrThrow: async () => ({ timeZone: 'UTC' }) }, calendarConnection: { upsert: mocks.upsert, update: mocks.update, findUnique: mocks.findUnique } } }));
import { calendarProviderFor, connectCalendar, GOOGLE_CALENDAR_SCOPES, oauthAuthorizationUrl } from './calendar';
import { decryptCredential, encryptCredential } from '@/lib/credentials';

const connection = () => ({ id: 'c1', userId: 'u1', provider: 'google', calendarId: 'owner@example.test', accessToken: encryptCredential('access'), refreshToken: encryptCredential('refresh'), tokenExpiresAt: new Date(Date.now() + 3600000), status: 'connected' }) as CalendarConnection;
function connectResponses(token: Record<string, unknown>) {
  mocks.fetch.mockResolvedValueOnce(Response.json(token))
    .mockResolvedValueOnce(Response.json({ email: 'owner@example.test' }))
    .mockResolvedValueOnce(Response.json({ id: 'owner@example.test', summary: 'Primary' }));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', 'https://app.nexdoapp.com/api/calendar/oauth/google/callback');
});
describe('least privilege Google Calendar OAuth', () => {
  it('requests exactly the shared narrow scope set with offline access', () => {
    const url = new URL(oauthAuthorizationUrl('google', 'state'));
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(['openid', 'email', 'https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/calendar.calendars.readonly']);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('include_granted_scopes')).toBeNull();
    expect(url.searchParams.has('client_secret')).toBe(false);
  });
  it.each(['http://example.test/callback', 'https://user:pass@example.test/callback', 'https://example.test/callback?next=evil'])('rejects unsafe configured callback %s', uri => {
    vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', uri);
    expect(() => oauthAuthorizationUrl('google', 's')).toThrow();
  });
  it('connects using metadata and encrypts credentials', async () => {
    connectResponses({ access_token: 'new-access', refresh_token: 'new-refresh', scope: GOOGLE_CALENDAR_SCOPES.join(' ') });
    await connectCalendar('google', 'u1', 'code');
    const data = mocks.upsert.mock.calls[0][0].create;
    expect(data.calendarId).toBe('owner@example.test');
    expect(data.refreshToken).not.toBe('new-refresh');
    expect(decryptCredential(data.refreshToken)).toBe('new-refresh');
  });
  it('preserves an existing refresh token when Google omits it on reconnect', async () => {
    connectResponses({ access_token: 'new-access' });
    mocks.findUnique.mockResolvedValue(connection());
    await connectCalendar('google', 'u1', 'code');
    expect(mocks.upsert.mock.calls[0][0].update).not.toHaveProperty('refreshToken');
  });
  it('does not save an unusable new connection without offline permission', async () => {
    connectResponses({ access_token: 'new-access' });
    mocks.findUnique.mockResolvedValue(null);
    await expect(connectCalendar('google', 'u1', 'code')).rejects.toThrow('Reconnect Google Calendar');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rejects partial calendar consent before replacing any existing token', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ access_token: 'partial', scope: 'openid email https://www.googleapis.com/auth/calendar.events.readonly' }));
    await expect(connectCalendar('google', 'u1', 'code')).rejects.toThrow('allow both calendar permissions');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('refreshes a legacy grant without asking to expand or narrow its scopes', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ access_token: 'renewed' }));
    await calendarProviderFor({ ...connection(), tokenExpiresAt: new Date(0) });
    const form = mocks.fetch.mock.calls[0][1].body as URLSearchParams;
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.has('scope')).toBe(false);
    expect(decryptCredential(mocks.update.mock.calls[0][0].data.refreshToken)).toBe('refresh');
  });
  it('never propagates provider error descriptions containing credentials', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: 'invalid_grant', error_description: 'private-token-value' }, { status: 400 }));
    await expect(calendarProviderFor({ ...connection(), tokenExpiresAt: new Date(0) })).rejects.toThrow('Calendar authorization failed');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('lists, creates, reschedules and deletes only events in the connected calendar', async () => {
    const provider = await calendarProviderFor(connection());
    mocks.fetch.mockResolvedValueOnce(Response.json({ items: [{ id: 'external', summary: 'Existing event', start: { dateTime: '2026-10-02T10:00:00Z' }, end: { dateTime: '2026-10-02T11:00:00Z' } }], nextSyncToken: 'sync' }))
      .mockResolvedValueOnce(Response.json({ id: 'event1' }))
      .mockResolvedValueOnce(Response.json({ id: 'event1' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const startAt = new Date('2026-10-02T10:00:00Z'); const endAt = new Date('2026-10-02T11:00:00Z');
    expect((await provider.list(startAt, endAt)).events[0].title).toBe('Existing event');
    await provider.upsert({ title: 'Approved', startAt, endAt });
    await provider.upsert({ title: 'Rescheduled', startAt, endAt, externalId: 'event1' });
    await provider.remove('event1');
    expect(mocks.fetch.mock.calls.map(call => call[1]?.method || 'GET')).toEqual(['GET', 'POST', 'PATCH', 'DELETE']);
    for (const [url] of mocks.fetch.mock.calls) expect(String(url)).toContain('/calendars/owner%40example.test/events');
  });
});
