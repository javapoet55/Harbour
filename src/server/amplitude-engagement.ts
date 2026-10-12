import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from './admin-auth';
import { observedFetch } from './health/telemetry';
import { strictAdminDateRange } from '@/lib/admin-date-range';

const responseSchema = z.object({ data: z.object({
  series: z.array(z.array(z.number().finite().nonnegative())).length(1),
  xValues: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
}) });
export function amplitudeDaily(payload: unknown) {
  const { data } = responseSchema.parse(payload);
  if (data.series[0].length !== data.xValues.length) throw new Error('Invalid series');
  return data.xValues.map((date, index) => ({ date, value: data.series[0][index] }));
}
const cache = new Map<string, { expires: number; data: unknown }>();

/** Aggregate-only, server-side Dashboard REST API. Credentials never reach the model. */
export async function getAmplitudeEngagement(from: string, to: string) {
  await requireAdmin();
  if (!strictAdminDateRange(from, to)) throw new Error('Invalid reporting range');
  const apiKey = process.env.AMPLITUDE_API_KEY?.trim();
  const secret = process.env.AMPLITUDE_SECRET_KEY?.trim();
  if (!apiKey || !secret) return { status: 'not_configured', message: 'Amplitude server credentials are not configured.' };
  const region = process.env.AMPLITUDE_REGION || 'US';
  if (!['US', 'EU'].includes(region)) return { status: 'unavailable', message: 'Amplitude region must be US or EU.' };
  const host = region === 'EU' ? 'https://analytics.eu.amplitude.com' : 'https://amplitude.com';
  const key = createHash('sha256').update(`${apiKey}:${secret}:${region}:${from}:${to}`).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { status: 'connected', data: hit.data };
  try {
    const series = await Promise.all(['active', 'new'].map(async (metric) => {
      const params = new URLSearchParams({ start: from.replaceAll('-', ''), end: to.replaceAll('-', ''), m: metric, i: '1' });
      const response = await observedFetch(`${host}/api/2/users?${params}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${secret}`).toString('base64')}` },
        cache: 'no-store', signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(response.status === 429 ? 'rate_limit' : 'provider_error');
      return amplitudeDaily(await response.json());
    }));
    const data = { source: 'Amplitude', projectId: process.env.AMPLITUDE_PROJECT_ID || 'configured project',
      from, to, fetchedAt: new Date().toISOString(), timeZone: process.env.AMPLITUDE_TIME_ZONE || 'Project timezone',
      dailyActiveUsers: series[0], dailyNewUsers: series[1],
      limits: ['Daily unique users must not be summed into period unique users.',
        'Project analytics are not database account counts. Do not assume these are iOS users.',
        'This connector currently provides daily active and new users, not funnels, retention, revenue, or attribution.'],
    };
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 300_000, data });
    return { status: 'connected', data };
  } catch (error) {
    return { status: 'unavailable', message: error instanceof Error && error.message === 'rate_limit'
      ? 'Amplitude rate limit reached. Try again later.' : 'Amplitude report unavailable. Check credentials, project access, or retry later.' };
  }
}
