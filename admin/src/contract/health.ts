import { z } from 'zod';

// GET /api/admin/health: getHealth() on the backend plus canOperate. Dates arrive as ISO strings.
export const healthRanges = ['1H', '6H', '24H', '7D', '30D'] as const;
export const healthStatusSchema = z.enum(['Healthy', 'Degraded', 'Down', 'Unknown']);
export type Status = z.infer<typeof healthStatusSchema>;

const count = z.number();
const optionalNumber = z.number().nullable();
const time = z.string();
const optionalTime = z.string().nullable();

export const healthSummarySchema = z.object({
  requests: count, rpm: z.number(), p50: optionalNumber, p95: optionalNumber, p99: optionalNumber, success: optionalNumber,
  errors: count, errors4xx: count, errors5xx: count, timeouts: count, rateLimits: count, authFailures: count,
  lastSuccess: optionalTime, lastFailure: optionalTime,
});
const namedSummary = healthSummarySchema.extend({ name: z.string(), status: healthStatusSchema });
const bucket = healthSummarySchema.extend({ time });
const coverage = z.object({
  requests: count, recentRequests: count, minimumSamples: count, lastObserved: optionalTime,
  reason: z.enum(['measured', 'low-traffic', 'inactive', 'no-activity']),
});
const statusCount = z.object({ status: z.string(), _count: count });

export const healthSchema = z.object({
  asOf: time,
  monitoring: z.object({ AI: coverage, Voice: coverage, Security: coverage }),
  range: z.enum(healthRanges),
  available: z.boolean(),
  enabled: z.boolean(),
  truncated: z.boolean(),
  usage: z.object({ input: optionalNumber, output: optionalNumber, cost: optionalNumber, reported: count, priced: count, requests: count }),
  costTrend: z.array(z.object({ time, cost: optionalNumber })),
  processMetrics: z.object({ counters: z.record(z.string(), z.number()) }),
  modelInventory: z.array(z.string()),
  voiceBuckets: z.array(bucket),
  overall: healthStatusSchema,
  sections: z.array(z.object({ name: z.string(), status: healthStatusSchema })),
  metrics: healthSummarySchema,
  buckets: z.array(bucket),
  database: z.object({
    status: healthStatusSchema,
    latency: optionalNumber,
    stats: z.object({ connections: count, maximum: count, bytes: count, rollbacks: count, deadlocks: count }).nullable(),
  }),
  endpoints: z.array(namedSummary),
  ai: z.array(namedSummary),
  integrations: z.array(namedSummary),
  integrationSummary: healthSummarySchema,
  jobSummary: z.array(namedSummary),
  voice: healthSummarySchema,
  voiceReportedMinutes: optionalNumber,
  security: healthSummarySchema,
  failures: z.array(z.object({ id: z.string(), time, service: z.string(), operation: z.string(), traceId: z.string(), status: count, error: z.string() })),
  incidents: z.array(z.object({
    id: z.string(), service: z.string(), severity: z.string(), trigger: z.string(), status: z.string(),
    ownerId: z.string().nullable(), startedAt: time, resolvedAt: optionalTime,
  })).nullable(),
  audit: z.array(z.object({ id: z.string(), createdAt: time, actorId: z.string(), action: z.string(), targetId: z.string(), detail: z.string() })).nullable(),
  rules: z.array(z.object({
    id: z.string(), service: z.string(), severity: z.string(), label: z.string(),
    threshold: z.number(), minimumSamples: count, enabled: z.boolean(),
  })),
  jobs: z.array(statusCount).nullable(),
  failedJobs: z.array(z.object({
    id: z.string(), status: z.string(), attempts: count, createdAt: time, claimedAt: optionalTime, updatedAt: time, traceId: z.string().nullable(),
  })).nullable(),
  reminders: z.array(statusCount).nullable(),
  due: z.number().nullable(),
  oldest: optionalTime,
  heartbeats: z.array(z.object({ service: z.string(), time, status: count, durationMs: z.number(), traceId: z.string() })),
  canOperate: z.boolean(),
});
export type HealthData = z.infer<typeof healthSchema>;

// POST /api/admin/health: operator actions.
export const healthActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('incident'), id: z.string().max(100), action: z.enum(['ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED']) }),
  z.object({ type: z.literal('rule'), id: z.string().max(100), threshold: z.number().finite().min(0).max(1000000), minimumSamples: z.number().int().min(1).max(100000), enabled: z.boolean() }),
]);
export const okSchema = z.object({ ok: z.literal(true) });
