import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from './admin-auth';
import { observedFetch } from './health/telemetry';
import { strictAdminDateRange } from '@/lib/admin-date-range';

const event = z.string().trim().min(1).max(200);
export const amplitudeAnalysisArgs = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('catalog') }).strict(),
  z.object({ kind: z.literal('funnel'), events: z.array(event).min(2).max(5), windowSeconds: z.number().int().min(1).max(2592000) }).strict(),
  z.object({ kind: z.literal('retention'), cohort: z.enum(['new', 'active']) }).strict(),
  z.object({ kind: z.literal('attribution'), event, dimension: z.enum(['utm_source', 'utm_medium', 'utm_campaign', 'referring_domain']), firstTouch: z.boolean() }).strict(),
]);
const count = z.number().finite().nonnegative();
const cell = z.object({ count, outof: count, incomplete: z.boolean() }).refine(v => v.count <= v.outof);
export function retentionReport(payload: unknown) {
  const parsed = z.object({ data: z.object({ series: z.array(z.object({ combined: z.array(cell) })).length(1) }) }).parse(payload);
  const values = parsed.data.series[0].combined;
  return [1, 7, 30].map(day => {
    const value = values[day + 1]; // index 0 is cohort size, index 1 is Day 0.
    return { day, retainedUsers: value?.count ?? null, eligibleUsers: value?.outof ?? null,
      incomplete: value?.incomplete ?? true,
      percent: value && !value.incomplete && value.outof > 0 ? value.count / value.outof * 100 : null };
  });
}
export function funnelReport(payload: unknown, events: string[]) {
  const parsed = z.object({ data: z.array(z.object({ cumulativeRaw: z.array(count),
    dayFunnels: z.object({ isComplete: z.array(z.boolean()) }).optional(),
  })).length(1) }).parse(payload);
  const values = parsed.data[0].cumulativeRaw;
  if (values.length !== events.length || values.some((v, i) => i > 0 && v > values[i - 1])) throw new Error('Invalid funnel');
  return { steps: events.map((name, i) => ({ event: name, users: values[i],
    conversionPercent: values[0] ? values[i] / values[0] * 100 : null,
    droppedFromPrevious: i ? values[i - 1] - values[i] : null })),
    incomplete: parsed.data[0].dayFunnels?.isComplete.some(v => !v) ?? true };
}
export function attributionReport(payload: unknown) {
  const data = z.object({ data: z.object({ seriesLabels: z.array(z.string()),
    seriesCollapsed: z.array(z.array(z.object({ value: count })).length(1)),
  }) }).parse(payload).data;
  if (data.seriesLabels.length !== data.seriesCollapsed.length) throw new Error('Invalid attribution');
  return data.seriesLabels.map((label, i) => ({ label, uniqueUsers: data.seriesCollapsed[i][0].value }));
}
const cache = new Map<string, { expires: number; result: unknown }>();

export async function getAmplitudeAnalysis(from: string, to: string, input: unknown) {
  await requireAdmin();
  const args = amplitudeAnalysisArgs.parse(input);
  const range = strictAdminDateRange(from, to);
  if (!range || range.days > 365) return { status: 'unavailable', message: 'Select a valid date range of at most 365 days for Amplitude analysis.' };
  const api = process.env.AMPLITUDE_API_KEY;
  const secret = process.env.AMPLITUDE_SECRET_KEY;
  if (!api || !secret) return { status: 'not_configured', message: 'Amplitude credentials are not configured.' };
  const region = process.env.AMPLITUDE_REGION || 'US';
  if (!['US', 'EU'].includes(region)) return { status: 'unavailable', message: 'Invalid Amplitude region.' };
  const key = createHash('sha256').update(JSON.stringify([api, secret, region, from, to, args])).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  const base = region === 'EU' ? 'https://analytics.eu.amplitude.com' : 'https://amplitude.com';
  async function read(path: string, params = new URLSearchParams()) {
    const response = await observedFetch(`${base}/api/2/${path}?${params}`, { cache: 'no-store',
      headers: { Authorization: `Basic ${Buffer.from(`${api}:${secret}`).toString('base64')}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(response.status === 429 ? 'rate_limit' : 'provider');
    return response.json();
  }
  try {
    const params = new URLSearchParams({ start: from.replaceAll('-', ''), end: to.replaceAll('-', '') });
    let report: unknown;
    if (args.kind === 'catalog' || args.kind === 'funnel' || args.kind === 'attribution') {
      const catalog = z.object({ data: z.array(z.object({ value: event, deleted: z.boolean().optional(), hidden: z.boolean().optional() })) }).parse(await read('events/list'));
      const available = catalog.data.filter(e => !e.deleted && !e.hidden).map(e => e.value);
      const requested = args.kind === 'funnel' ? args.events : args.kind === 'attribution' && args.event !== '_active' ? [args.event] : [];
      if (requested.some(name => !available.includes(name))) return { status: 'unavailable', message: 'Requested event is not in this project. Choose from the event catalog.', availableEvents: available.slice(0, 100) };
      if (args.kind === 'catalog') report = { events: available.slice(0, 100), truncated: available.length > 100 };
      else if (args.kind === 'funnel') {
        args.events.forEach(name => params.append('e', JSON.stringify({ event_type: name })));
        params.set('mode', 'ordered'); params.set('cs', String(args.windowSeconds));
        report = { ...funnelReport(await read('funnels', params), args.events), mode: 'ordered', windowSeconds: args.windowSeconds,
          note: 'Recent entrants may still convert within the conversion window; incomplete funnels are provisional.' };
      } else {
        const property = `${args.firstTouch ? 'initial_' : ''}${args.dimension}`;
        params.set('e', JSON.stringify({ event_type: args.event })); params.set('m', 'uniques'); params.set('g', `gp:${property}`); params.set('limit', '20');
        report = { groups: attributionReport(await read('events/segmentation', params)), property, event: args.event,
          attributionModel: args.firstTouch ? 'First recorded acquisition property' : 'Recorded user acquisition property',
          note: 'Top 20 groups. Missing/(none) is unknown, not proven direct traffic. User-property attribution is not multi-touch or causal attribution. Users may appear in multiple groups; do not sum groups into unique users.' };
      }
    } else {
      params.set('se', JSON.stringify({ event_type: args.cohort === 'new' ? '_new' : '_active' }));
      params.set('re', JSON.stringify({ event_type: '_active' })); params.set('i', '1');
      // Omit rm: the API default is N-day; explicit "n-day" is rejected by the live API.
      report = { cohort: args.cohort, returnEvent: '_active', method: 'N-day daily retention',
        days: retentionReport(await read('retention', params)),
        note: 'Null rates mean unavailable, incomplete, or zero eligible users; never interpret them as 0% retention.' };
    }
    const result = { status: 'connected', source: 'Amplitude', projectId: process.env.AMPLITUDE_PROJECT_ID,
      from, to, timeZone: process.env.AMPLITUDE_TIME_ZONE || 'Project timezone', fetchedAt: new Date().toISOString(), kind: args.kind, report };
    if (cache.size >= 40) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 300000, result });
    return result;
  } catch (error) {
    return { status: 'unavailable', source: 'Amplitude', message: error instanceof Error && error.message === 'rate_limit'
      ? 'Amplitude rate limit reached. Retry later.' : 'Amplitude analysis unavailable. Check project access or retry later.' };
  }
}
