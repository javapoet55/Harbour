import { z } from 'zod';

// GET /api/admin/voice-tokens: getVoiceTokens() on the backend, one row per user and Pacific date.
export const voiceTokenRowSchema = z.object({
  userId: z.string(),
  user: z.string(),
  date: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  records: z.number(),
  tokenRecords: z.number(),
  textCostUsd: z.number(),
  audioCostUsd: z.number(),
  pricedRecords: z.number(),
  unpricedRecords: z.number(),
});
export const voiceTokensSchema = z.array(voiceTokenRowSchema);

export type VoiceTokenRow = z.infer<typeof voiceTokenRowSchema>;
