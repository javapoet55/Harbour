import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./firebase-engagement', () => ({ getFirebaseEngagement: vi.fn() }));
vi.mock('./amplitude-engagement', () => ({ getAmplitudeEngagement: vi.fn() }));
vi.mock('./admin-analytics', () => ({ getAdminSnapshot: vi.fn() }));
import { getFirebaseEngagement } from './firebase-engagement';
import { getAmplitudeEngagement } from './amplitude-engagement';
import { getAdminSnapshot } from './admin-analytics';
import { answerAdminAnalyticsQuestion, adminAnswerSchema, adminAssistantInstructions, adminOverviewGrounding, adminQuestionSchema } from './admin-insights';

function snapshot() {
  return {
    generatedAt: '2026-09-20T12:00:00.000Z', days: 30,
    metrics: { totalUsers: 3, newUsers: 1, activeUsers: 2, aiActions: 8, voiceMinutes: 12.5, voiceSessions: 4, estimatedMrr: 29.98, verifiedUsers: 3 },
    changes: { newUsers: 20, aiActions: -5, voiceMinutes: 10 },
    planCounts: { FREE: 1, PRO: 1, MAX: 1 },
    users: [
      { id: 'secret-id', name: 'Sri', email: 'sri@example.com', plan: 'MAX' as const, createdAt: '2026-09-20T10:00:00.000Z', lastActiveAt: '2026-09-20T11:00:00.000Z', aiActions: 8, voiceMinutes: 12.5, verified: true },
    ],
    featureCounts: [{ label: 'AI assistant', value: 8, color: '#000' }],
    trends: { signups: [], totalUsers: [], aiActions: [], voiceMinutes: [] },
    recentVoice: [{ id: 'voice-1', user: 'sri@example.com', date: '2026-09-20T11:00:00.000Z', minutes: 2.5, type: 'Realtime', status: 'Completed' }],
  };
}

describe('admin analytics assistant grounding', () => {
  it('accepts a bounded usage question and selected date range', () => {
    expect(adminQuestionSchema.parse({ question: ' Which feature is most used? ', days: 30 })).toEqual({ question: 'Which feature is most used?', days: 30 });
    expect(adminQuestionSchema.parse({ question: 'Show usage', days: 20, from: '2026-09-01', to: '2026-09-20' })).toMatchObject({ days: 20, from: '2026-09-01', to: '2026-09-20' });
    expect(adminQuestionSchema.safeParse({ question: 'x', days: 30 }).success).toBe(false);
    expect(adminQuestionSchema.safeParse({ question: 'Show usage', days: 367 }).success).toBe(false);
    expect(adminQuestionSchema.safeParse({ question: 'Show usage', days: 10, from: '2026-09-01', to: '2026-09-20' }).success).toBe(false);
  });

  it('grounds the model in reporting data without internal user identifiers', () => {
    const grounding = adminOverviewGrounding(snapshot() as never);
    expect(grounding.metrics.aiActions).toBe(8);
    expect(grounding.recentSignups[0]).toMatchObject({ email: 'sri@example.com', plan: 'MAX' });
    expect(JSON.stringify(grounding)).not.toContain('secret-id');
    expect(grounding.dataLimits.join(' ')).toMatch(/token counts are not currently stored/i);
  });

  it('requires database-only answers and protects secrets', () => {
    expect(adminAssistantInstructions).toMatch(/only facts returned/i);
    expect(adminAssistantInstructions).toMatch(/Never expose password hashes/i);
    expect(adminAssistantInstructions).toMatch(/read-only/i);
    expect(adminAssistantInstructions).toMatch(/relevant line or bar chart/i);
    expect(adminAnswerSchema.safeParse({ answer: 'Usage increased.', chart: { type: 'line', title: 'Usage', xLabel: 'Day', yLabel: 'Actions', series: [{ name: 'AI actions', color: '#287ff5', data: [{ label: 'Sep 20', value: 4 }] }] } }).success).toBe(true);
    expect(adminAnswerSchema.safeParse({ answer: 'No chart needed.', chart: null }).success).toBe(true);
  });
});


afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('provider tool dispatch', () => {
  it('queries both sources with the selected range and preserves unavailable status', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fake-key');
    vi.mocked(getAdminSnapshot).mockResolvedValue(snapshot() as never);
    vi.mocked(getFirebaseEngagement).mockResolvedValue({ status: 'unavailable', message: 'Temporary Google outage' });
    vi.mocked(getAmplitudeEngagement).mockResolvedValue({ status: 'connected', data: { dailyActiveUsers: [{date:'2026-09-01',value:9}] } });
    const tool = (name: string) => Response.json({ output: [{ type: 'function_call', name, call_id: name, arguments: '{}' }] });
    const requests: Array<Record<string, unknown>> = [];
    const responses = [tool('get_firebase_engagement'), tool('get_amplitude_engagement'), Response.json({ output_text: JSON.stringify({ answer: 'Firebase unavailable. Amplitude daily users: 9.', chart: null }) })];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => { requests.push(JSON.parse(options.body)); return responses.shift()!; }));
    await answerAdminAnalyticsQuestion('admin', 'Compare Firebase and Amplitude', 2, { from: new Date('2026-09-01'), to: new Date('2026-09-02') });
    expect(getFirebaseEngagement).toHaveBeenCalledWith('2026-09-01', '2026-09-02');
    expect(getAmplitudeEngagement).toHaveBeenCalledWith('2026-09-01', '2026-09-02');
    expect(JSON.stringify(requests[2].input)).toContain('Temporary Google outage');
    expect(JSON.stringify(requests[2].input)).toContain('dailyActiveUsers');
  });
});
