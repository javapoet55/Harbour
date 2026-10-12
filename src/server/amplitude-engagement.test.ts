import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./admin-auth', () => ({ requireAdmin: vi.fn() }));
import { requireAdmin } from './admin-auth';
import { amplitudeDaily, getAmplitudeEngagement } from './amplitude-engagement';
let n = 0;
beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin' } as never);
  vi.stubEnv('AMPLITUDE_API_KEY', `test-${++n}`);
  vi.stubEnv('AMPLITUDE_SECRET_KEY', 'test-secret');
  vi.stubEnv('AMPLITUDE_REGION', 'US');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('Amplitude aggregate reader', () => {
  it('authorizes before reading data or configuration', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN'));
    await expect(getAmplitudeEngagement('2026-09-01', '2026-09-02')).rejects.toThrow('FORBIDDEN');
  });
  it('reports missing credentials without inventing metrics', async () => {
    vi.stubEnv('AMPLITUDE_SECRET_KEY', '');
    expect((await getAmplitudeEngagement('2026-09-01', '2026-09-02')).status).toBe('not_configured');
  });
  it('rejects malformed and misaligned series', () => {
    expect(() => amplitudeDaily({ data: { xValues: ['2026-09-01'], series: [[]] } })).toThrow();
    expect(() => amplitudeDaily({ data: { xValues: ['2026-09-01'], series: [[-1]] } })).toThrow();
  });
  it('preserves daily values, exact dates, server credentials, and caches after authorization', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ data: { xValues: ['2026-09-01'], series: [[9]] } }));
    vi.stubGlobal('fetch', fetcher);
    const report = await getAmplitudeEngagement('2026-09-01', '2026-09-02');
    expect(report.status).toBe('connected');
    expect(JSON.stringify(report)).toContain('dailyActiveUsers');
    expect(JSON.stringify(report)).not.toContain('test-secret');
    expect(fetcher.mock.calls[0][0]).toContain('start=20260901&end=20260902');
    await getAmplitudeEngagement('2026-09-01', '2026-09-02');
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN'));
    await expect(getAmplitudeEngagement('2026-09-01', '2026-09-02')).rejects.toThrow();
  });
  it.each([401,403,429,500])('handles HTTP %i without exposing provider errors', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider data', { status })));
    const report = await getAmplitudeEngagement('2026-09-01', '2026-09-02');
    expect(report.status).toBe('unavailable');
    expect(JSON.stringify(report)).not.toContain('private provider data');
  });
  it('handles timeout failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect((await getAmplitudeEngagement('2026-09-01', '2026-09-02')).status).toBe('unavailable');
  });
});
