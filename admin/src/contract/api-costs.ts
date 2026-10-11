import { z } from 'zod';
export const apiCostReportSchema = z.array(z.object({
  user: z.string(), userId: z.string().nullable(), operation: z.string(), feature: z.string(), model: z.string(), requests: z.number(), pricedRequests: z.number(), tokenRequests: z.number(),
  costUsd: z.number().nullable(), inputTokens: z.number().nullable(), outputTokens: z.number().nullable(),
}));
export type ApiCostReport = z.infer<typeof apiCostReportSchema>;
