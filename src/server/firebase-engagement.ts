import { observedFetch } from '@/server/health/telemetry';
import { createHash } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';
import { requireAdmin } from './admin-auth';
import { parseAdminDateRange } from '@/lib/admin-date-range';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const credentialsSchema = z.object({
  type: z.literal('service_account'),
  client_email: z.string().email(),
  private_key: z.string().min(1),
});
const reportSchema = z.object({
  metricHeaders: z.array(z.object({ name: z.string() })),
  dimensionHeaders: z.array(z.object({ name: z.string() })).optional(),
  rows: z.array(z.object({
    dimensionValues: z.array(z.object({ value: z.string().optional() })).optional(),
    metricValues: z.array(z.object({ value: z.string() })),
  })).optional(),
  metadata: z.object({ timeZone: z.string().optional(), subjectToThresholding: z.boolean().optional(),
    dataLossFromOtherRow: z.boolean().optional(), samplingMetadatas: z.array(z.unknown()).optional() }).optional(),
});
type Report = z.infer<typeof reportSchema>;
export type EngagementRow = { label: string; values: Record<string, number> };
export type FirebaseEngagement = {
  propertyId: string; streamId?: string; from: string; to: string; fetchedAt: string; timeZone: string;
  summary: Record<string, number>; daily: EngagementRow[]; events: EngagementRow[];
  screens: EngagementRow[]; versions: EngagementRow[]; limited: boolean;
};
export type EngagementResult = { status: 'connected'; data: FirebaseEngagement }
  | { status: 'not_configured' | 'unavailable'; message: string };
class AnalyticsError extends Error {}
let tokenCache: { key: string; token: string; expires: number } | undefined;
const reportsCache = new Map<string, { expires: number; data: FirebaseEngagement }>();

function configuration() {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const credentials = process.env.GA4_SERVICE_ACCOUNT_JSON;
  const streamId = process.env.GA4_STREAM_ID?.trim();
  if (!propertyId || !credentials) return null;
  if (!/^\d+$/.test(propertyId) || (streamId && !/^\d+$/.test(streamId))) throw new AnalyticsError('Use numeric GA4 property and stream IDs in the server configuration.');
  try {
    return { propertyId, streamId, credentials: credentialsSchema.parse(JSON.parse(credentials)),
      key: createHash('sha256').update(credentials).digest('hex') };
  } catch { throw new AnalyticsError('The analytics service-account configuration is invalid. Check the server secret.'); }
}

async function accessToken(config: NonNullable<ReturnType<typeof configuration>>) {
  if (tokenCache?.key === config.key && tokenCache.expires > Date.now()) return tokenCache.token;
  let assertion: string;
  try {
    const key = await importPKCS8(config.credentials.private_key.replace(/\\n/g, '\n'), 'RS256');
    assertion = await new SignJWT({ scope: SCOPE }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(config.credentials.client_email).setAudience(TOKEN_URL).setIssuedAt().setExpirationTime('1h').sign(key);
  } catch { throw new AnalyticsError('The analytics service-account private key could not be loaded.'); }
  const response = await observedFetch(TOKEN_URL, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!response.ok) throw new AnalyticsError('Google could not authenticate the analytics service account. Check that its key is active.');
  const value = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).parse(await response.json());
  tokenCache = { key: config.key, token: value.access_token, expires: Date.now() + Math.max(0, value.expires_in - 60) * 1000 };
  return value.access_token;
}

export function engagementRows(report: Report): EngagementRow[] {
  return (report.rows ?? []).map((row) => {
    if (row.metricValues.length !== report.metricHeaders.length) throw new Error('Invalid analytics metrics');
    const values: Record<string, number> = {};
    report.metricHeaders.forEach((header, index) => {
      const value = Number(row.metricValues[index].value);
      if (!Number.isFinite(value) || value < 0) throw new Error('Invalid analytics value');
      values[header.name] = value;
    });
    return { label: row.dimensionValues?.map((value) => value.value || '(not set)').join(' · ') ?? '', values };
  });
}

export function engagementRequests(from: string, to: string, streamId?: string) {
  const filter = streamId ? { fieldName: 'streamId', stringFilter: { matchType: 'EXACT', value: streamId } }
    : { fieldName: 'platform', stringFilter: { matchType: 'EXACT', value: 'iOS', caseSensitive: false } };
  const base = { dateRanges: [{ startDate: from, endDate: to }], dimensionFilter: { filter }, keepEmptyRows: false };
  const request = (metrics: string[], dimension?: string, limit = 20) => ({ ...base,
    metrics: metrics.map((name) => ({ name })),
    ...(dimension ? { dimensions: [{ name: dimension }], limit: String(limit),
      orderBys: dimension === 'date' ? [{ dimension: { dimensionName: 'date' } }]
        : [{ metric: { metricName: metrics[0] }, desc: true }] } : {}),
  });
  return [
    request(['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'userEngagementDuration', 'screenPageViews', 'eventCount']),
    request(['activeUsers', 'sessions'], 'date', 366),
    request(['eventCount', 'totalUsers'], 'eventName'),
    request(['screenPageViews', 'activeUsers'], 'unifiedScreenClass'),
    request(['activeUsers', 'sessions'], 'appVersion'),
  ];
}

/** Always authorize before reading secrets, consulting caches, or contacting Google. */
export async function getFirebaseEngagement(from?: string, to?: string): Promise<EngagementResult> {
  await requireAdmin();
  try {
    const config = configuration();
    if (!config) return { status: 'not_configured', message: 'Connect the GA4 property and a read-only service account to load Firebase engagement reports.' };
    const range = parseAdminDateRange(from, to);
    const cacheKey = `${config.key}:${config.propertyId}:${config.streamId ?? 'ios'}:${range.from}:${range.to}`;
    const cached = reportsCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return { status: 'connected', data: cached.data };
    const token = await accessToken(config);
    const response = await observedFetch(`https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:batchRunReports`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: engagementRequests(range.from, range.to, config.streamId) }),
    });
    if (!response.ok) {
      if (response.status === 401) { tokenCache = undefined; throw new AnalyticsError('Analytics authentication expired. Reload to reconnect.'); }
      if (response.status === 403) throw new AnalyticsError('Analytics access was denied. Enable the Google Analytics Data API and grant this service account Viewer access to the GA4 property.');
      if (response.status === 429) throw new AnalyticsError('Google Analytics reporting quota is temporarily exhausted. Try again later.');
      throw new AnalyticsError('Google Analytics could not load the report. Verify the GA4 property ID or try again later.');
    }
    const { reports } = z.object({ reports: z.array(reportSchema).length(5) }).parse(await response.json());
    const summary = engagementRows(reports[0])[0]?.values ?? {};
    const data: FirebaseEngagement = {
      propertyId: config.propertyId, streamId: config.streamId, from: range.from, to: range.to, fetchedAt: new Date().toISOString(),
      timeZone: reports[0].metadata?.timeZone ?? 'GA4 property time zone', summary,
      daily: engagementRows(reports[1]), events: engagementRows(reports[2]), screens: engagementRows(reports[3]), versions: engagementRows(reports[4]),
      limited: reports.some((report) => report.metadata?.subjectToThresholding || report.metadata?.dataLossFromOtherRow || (report.metadata?.samplingMetadatas?.length ?? 0) > 0),
    };
    if (reportsCache.size >= 20) reportsCache.delete(reportsCache.keys().next().value!);
    reportsCache.set(cacheKey, { data, expires: Date.now() + 5 * 60_000 });
    return { status: 'connected', data };
  } catch (error) {
    // Never return provider response bodies, credentials, or JWTs to the browser/logs.
    return { status: 'unavailable', message: error instanceof AnalyticsError ? error.message : 'Analytics is temporarily unavailable. Check the connection and try again.' };
  }
}
