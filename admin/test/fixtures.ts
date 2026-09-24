import type { HealthData } from '@/contract/health';
import type { AdminSnapshot } from '@/contract/snapshot';

// Contract-shaped stand-ins for what the backend returns on an empty database. The backend's own
// contract test (src/app/api/admin/contract.integration.test.ts) checks real responses against the same schemas.
const trend = (days: number) => Array.from({ length: days }, (_, index) => ({ label: `Sep ${index + 1}`, value: 0 }));

export function emptySnapshot(): AdminSnapshot {
  return {
    generatedAt: '2026-09-15T12:00:00.000Z', rangeStart: '2026-09-01T00:00:00.000Z', rangeEnd: '2026-09-15T23:59:59.999Z', days: 15,
    metrics: { totalUsers: 0, newUsers: 0, activeUsers: 0, aiActions: 0, voiceMinutes: 0, voiceSessions: 0, estimatedMrr: 0, verifiedUsers: 0 },
    changes: { newUsers: 0, aiActions: 0, voiceMinutes: 0 },
    planCounts: { FREE: 0, PRO: 0, MAX: 0 },
    users: [],
    featureCounts: [{ label: 'Tasks & planning', value: 0, color: '#1d7dfa' }, { label: 'AI assistant', value: 0, color: '#7655eb' }],
    trends: { signups: trend(15), totalUsers: trend(15), aiActions: trend(15), voiceMinutes: trend(15) },
    actionRecords: [], voiceRecords: [], recentVoice: [],
  };
}

const summary = () => ({
  requests: 0, rpm: 0, p50: null, p95: null, p99: null, success: null, errors: 0, errors4xx: 0, errors5xx: 0,
  timeouts: 0, rateLimits: 0, authFailures: 0, lastSuccess: null, lastFailure: null,
});
const coverage = () => ({ requests: 0, recentRequests: 0, minimumSamples: 5, lastObserved: null, reason: 'no-activity' as const });
const buckets = () => Array.from({ length: 24 }, (_, index) => ({ time: new Date(Date.UTC(2026, 8, 15, index)).toISOString(), ...summary() }));
const integrations = ['OpenAI', 'Google Calendar', 'Microsoft Calendar', 'Gmail', 'Google OAuth', 'Microsoft OAuth', 'Apple Authentication', 'SendGrid', 'Twilio', 'Firebase Analytics', 'Web Push', 'iOS Contacts'];

export function emptyHealth(): HealthData {
  return {
    asOf: '2026-09-15T12:00:00.000Z',
    monitoring: { AI: coverage(), Voice: coverage(), Security: coverage() },
    range: '1H', available: true, enabled: false, truncated: false,
    usage: { input: null, output: null, cost: null, reported: 0, priced: 0, requests: 0 },
    costTrend: buckets().map(({ time }) => ({ time, cost: null })),
    processMetrics: { counters: {} },
    modelInventory: ['gpt-5.4-mini', 'gpt-4o-transcribe'],
    voiceBuckets: buckets(),
    overall: 'Unknown',
    sections: ['API', 'Database', 'AI', 'Voice', 'Integrations', 'Jobs', 'iOS', 'Security'].map((name) => ({ name, status: name === 'Database' ? 'Healthy' as const : 'Unknown' as const })),
    metrics: summary(), buckets: buckets(),
    database: { status: 'Healthy', latency: 1.2, stats: null },
    endpoints: [], ai: [],
    integrations: integrations.map((name) => ({ name, status: 'Unknown' as const, ...summary() })),
    integrationSummary: summary(), jobSummary: [],
    voice: summary(), voiceReportedMinutes: 0, security: summary(),
    failures: [], incidents: [], audit: [],
    rules: [
      { id: 'api-errors', service: 'API', severity: 'SEV-2', label: 'API 5xx rate (%)', threshold: 5, minimumSamples: 20, enabled: true },
      { id: 'database-down', service: 'Database', severity: 'SEV-1', label: 'Database unavailable (1 = down)', threshold: 1, minimumSamples: 1, enabled: true },
    ],
    jobs: [], failedJobs: [], reminders: [], due: 0, oldest: null, heartbeats: [],
    canOperate: false,
  };
}
