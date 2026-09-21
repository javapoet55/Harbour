export type Status = 'Healthy' | 'Degraded' | 'Down' | 'Unknown';
export type Sample = { status: number; durationMs: number; errorCode: string | null; createdAt: Date };
export const windows = { '1H': 1, '6H': 6, '24H': 24, '7D': 168, '30D': 720 } as const;
export function summarize(rows: Sample[], minutes: number) {
  const latencies = rows.map(r => r.durationMs).sort((a,b) => a-b);
  const percentile = (p: number) => latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length*p)-1)] : null;
  const failures = rows.filter(r => r.status === 0 || r.status >= 400).length;
  return { requests: rows.length, rpm: rows.length / minutes, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99),
    success: rows.length ? (rows.length-failures)/rows.length*100 : null,
    errors: failures, errors4xx: rows.filter(r=>r.status>=400&&r.status<500).length, errors5xx: rows.filter(r=>r.status>=500).length,
    timeouts: rows.filter(r=>r.errorCode==='TIMEOUT').length, rateLimits: rows.filter(r=>r.status===429).length,
    authFailures: rows.filter(r=>r.status===401||r.status===403).length,
    lastSuccess: rows.filter(r=>r.status>=200&&r.status<400).map(r=>r.createdAt.toISOString()).sort().at(-1) ?? null,
    lastFailure: rows.filter(r=>r.status===0||r.status>=400).map(r=>r.createdAt.toISOString()).sort().at(-1) ?? null };
}
export function state(rows: Sample[], now = Date.now()): Status {
  const recent = rows.filter(r=>+r.createdAt >= now-15*60000);
  if (recent.length<5) return 'Unknown';
  const ratio = recent.filter(r=>r.status===0||r.status>=400).length/recent.length;
  return ratio>=.5 ? 'Down' : ratio>=.05 || recent.some(r=>r.status===429) ? 'Degraded' : 'Healthy';
}
export function overall(states: Status[]): Status {
  if (states.includes('Down')) return 'Down';
  if (states.includes('Degraded')) return 'Degraded';
  if (!states.length || states.includes('Unknown')) return 'Unknown';
  return 'Healthy';
}
export const ruleDefinitions = [
  { id:'api-errors', service:'API', severity:'SEV-2', label:'API 5xx rate (%)', threshold:5, minimumSamples:20 },
  { id:'api-latency', service:'API', severity:'SEV-4', label:'API P95 (ms)', threshold:2000, minimumSamples:20 },
  { id:'ai-errors', service:'OpenAI', severity:'SEV-2', label:'OpenAI request failure rate (%)', threshold:10, minimumSamples:10 },
  { id:'voice-errors', service:'Voice', severity:'SEV-2', label:'Voice API failure rate (%)', threshold:10, minimumSamples:10 },
  { id:'auth-errors', service:'Authentication', severity:'SEV-1', label:'Authentication API 5xx rate (%)', threshold:50, minimumSamples:10 },
  { id:'integration-errors', service:'Integrations', severity:'SEV-4', label:'External integration failure rate (%)', threshold:10, minimumSamples:20 },
  { id:'database-down', service:'Database', severity:'SEV-1', label:'Database unavailable (1 = down)', threshold:1, minimumSamples:1 },
  { id:'queue-backlog', service:'Jobs', severity:'SEV-2', label:'Due Moments queue depth', threshold:100, minimumSamples:1 },
  { id:'scheduler-stale', service:'Jobs', severity:'SEV-2', label:'Moments heartbeat age (minutes)', threshold:15, minimumSamples:1 },
] as const;
export function breached(value: number | null, samples: number, rule: { threshold: number; minimumSamples: number; enabled: boolean }) {
  return rule.enabled && value !== null && Number.isFinite(value) && samples>=rule.minimumSamples && value>=rule.threshold;
}
