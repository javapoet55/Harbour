import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { decodeJwt } from 'jose';
vi.mock('./admin-auth', () => ({ requireAdmin: vi.fn() }));
import { requireAdmin } from './admin-auth';
import { engagementRequests, engagementRows, getFirebaseEngagement } from './firebase-engagement';
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
let property = 9000;
const report = (metrics: string[], values?: string[], label?: string) => ({ metricHeaders: metrics.map(name => ({ name })),
  ...(values ? { rows: [{ metricValues: values.map(value => ({ value })), dimensionValues: label ? [{ value: label }] : [] }] } : {}), metadata: { timeZone: 'America/Los_Angeles' } });
beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin' } as Awaited<ReturnType<typeof requireAdmin>>);
  vi.stubEnv('GA4_PROPERTY_ID', String(++property));
  vi.stubEnv('GA4_STREAM_ID', '');
  vi.stubEnv('GA4_SERVICE_ACCOUNT_JSON', JSON.stringify({ type: 'service_account', client_email: `reader${property}@example.iam.gserviceaccount.com`, private_key: privateKey }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('Firebase engagement reporting', () => {
  it('rejects non-admin callers before contacting Google', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN'));
    await expect(getFirebaseEngagement()).rejects.toThrow('FORBIDDEN');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('shows configuration needed rather than invented zero metrics', async () => {
    vi.stubEnv('GA4_SERVICE_ACCOUNT_JSON', '');
    expect((await getFirebaseEngagement()).status).toBe('not_configured');
  });
  it('rejects non-numeric property IDs before any request', async () => {
    vi.stubEnv('GA4_PROPERTY_ID', '../wrong');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await getFirebaseEngagement()).status).toBe('unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('constrains reports to iOS or an explicit stream and sends at most five requests', () => {
    const requests = engagementRequests('2026-09-01', '2026-09-15');
    expect(requests).toHaveLength(5);
    expect(requests.every(r => r.dimensionFilter.filter.stringFilter.value === 'iOS')).toBe(true);
    expect(requests[1].limit).toBe('366');
    expect(engagementRequests('2026-09-01', '2026-09-15', '123')[0].dimensionFilter.filter.fieldName).toBe('streamId');
  });
  it('maps metrics by headers, preserves fractions, and rejects malformed values', () => {
    expect(engagementRows(report(['engagementRate', 'activeUsers'], ['0.75', '4']))[0].values).toEqual({ engagementRate: 0.75, activeUsers: 4 });
    expect(() => engagementRows(report(['sessions'], ['NaN']))).toThrow();
    expect(() => engagementRows(report(['sessions', 'activeUsers'], ['2']))).toThrow();
  });
  it('uses read-only authorization, period totals, and an authorized cache', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-token', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ reports: [
        report(['activeUsers', 'sessions'], ['3', '5']), report(['activeUsers'], ['2'], '20260901'),
        report(['eventCount', 'totalUsers'], ['8', '2'], 'screen_view'), report(['screenPageViews'], ['8'], 'Home'),
        { ...report(['activeUsers'], ['3'], '1.0'), metadata: { subjectToThresholding: true } },
      ] }));
    vi.stubGlobal('fetch', fetcher);
    const result = await getFirebaseEngagement('2026-09-01', '2026-09-15');
    expect(result.status).toBe('connected');
    if (result.status === 'connected') {
      expect(result.data.summary.activeUsers).toBe(3); // Do not sum daily unique users.
      expect(result.data.limited).toBe(true);
    }
    const jwt = (fetcher.mock.calls[0][1].body as URLSearchParams).get('assertion')!;
    expect(decodeJwt(jwt).scope).toBe('https://www.googleapis.com/auth/analytics.readonly');
    expect(fetcher.mock.calls[1][0]).toContain(`/properties/${property}:batchRunReports`);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).requests[0].dateRanges[0]).toEqual({ startDate: '2026-09-01', endDate: '2026-09-15' });
    await getFirebaseEngagement('2026-09-01', '2026-09-15');
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN'));
    await expect(getFirebaseEngagement('2026-09-01', '2026-09-15')).rejects.toThrow('FORBIDDEN');
  });
  it.each([403, 429, 500])('reports provider failure %s without leaking response bodies', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'secret-token', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ error: 'sensitive-provider-detail' }, { status })));
    const result = await getFirebaseEngagement();
    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toMatch(/secret-token|sensitive-provider-detail|private_key/);
  });
  it('treats an empty successful report as no recorded data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-token', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ reports: Array.from({ length: 5 }, () => report(['activeUsers'])) })));
    const result = await getFirebaseEngagement();
    expect(result.status).toBe('connected');
    if (result.status === 'connected') expect(result.data.daily).toEqual([]);
  });
});
