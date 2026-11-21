/** Labels and the 429 body for the daily AI quota; shared by the server quota and the error mapper. */
export const AI_FEATURE_LABELS: Record<string, string> = {
  assistant: 'Ask Nexdo questions',
  voice_tasks: 'voice task sessions',
  live_transcription: 'live voice transcriptions',
  dictation: 'voice dictations',
  spoken_replies: 'spoken replies',
  shopping_photo: 'shopping photo identifications',
  shopping_image: 'AI item images',
  shopping_suggestions: 'shopping suggestions',
  shopping_alternatives: 'healthier-alternative lookups',
  greeting_wish: 'AI-written wishes',
  greeting_art: 'AI greeting card artwork',
  checkin_call: 'test check-in calls',
  support_ticket: 'support ticket messages',
};

export function aiQuotaBody(quota: { feature: string; limit: number; resetsAt: Date }) {
  return {
    error: `You’ve used all ${quota.limit} of today’s ${AI_FEATURE_LABELS[quota.feature] ?? 'AI requests'}. They reset at midnight in your time zone.`,
    code: 'AI_DAILY_LIMIT_REACHED', feature: quota.feature, limit: quota.limit, resetsAt: quota.resetsAt.toISOString(),
  };
}
