/** Daily food check-in call configuration. All values are server-side only. */

// Built-in Realtime voices (gpt-realtime-2.1). marin and cedar are OpenAI's recommended voices.
export const REALTIME_VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'] as const;
export type RealtimeVoice = (typeof REALTIME_VOICES)[number];
export const DEFAULT_VOICE: RealtimeVoice = 'marin';
export const isRealtimeVoice = (value: unknown): value is RealtimeVoice => typeof value === 'string' && (REALTIME_VOICES as readonly string[]).includes(value);

export const NUTRITION_CALL_MODEL = 'gpt-realtime-2.1';
export const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'] as const;
export type Meal = (typeof MEALS)[number];
export const NO_ANSWER_POLICIES = ['NOTIFY', 'RETRY_ONCE', 'SKIP'] as const;
export type NoAnswerPolicy = (typeof NO_ANSWER_POLICIES)[number];

/** Calls are never placed outside this local window, whatever the saved time says. */
export const CALL_WINDOW = { earliest: '08:00', latest: '21:30' } as const;
/** A missed scheduled time is still dialed within this many minutes (for example after a worker restart). */
export const LATE_DIAL_GRACE_MINUTES = 60;
export const RETRY_DELAY_MINUTES = 15;
export const MANUAL_CALL_COOLDOWN_MINUTES = 10;

export function nutritionCallConfig() {
  const max = Number(process.env.NUTRITION_CALL_MAX_SECONDS ?? '300');
  return {
    enabled: process.env.NUTRITION_CALLS_ENABLED === 'true',
    // The conversation cap. Twilio also enforces it as the call's TimeLimit.
    maxSeconds: Number.isFinite(max) && max >= 60 && max <= 300 ? Math.round(max) : 300,
    appUrl: process.env.APP_URL?.trim().replace(/\/$/, '') || '',
    workerUrl: process.env.NUTRITION_CALL_WORKER_URL?.trim() || '',
    workerSecret: process.env.VOICE_WORKER_SECRET?.trim() || '',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID?.trim() || '',
      authToken: process.env.TWILIO_AUTH_TOKEN?.trim() || '',
      from: process.env.TWILIO_VOICE_NUMBER?.trim() || process.env.TWILIO_FROM_NUMBER?.trim() || '',
    },
  };
}
