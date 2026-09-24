import { z } from 'zod';

// POST /api/admin/insights: request body and answer.
export const adminQuestionSchema = z.object({
  question: z.string().trim().min(3).max(600),
  days: z.number().int().min(1).max(366),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export const adminAnswerChartSchema = z.object({
  type: z.enum(['line', 'bar']),
  title: z.string(),
  xLabel: z.string(),
  yLabel: z.string(),
  series: z.array(z.object({
    name: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    data: z.array(z.object({ label: z.string(), value: z.number() })),
  })),
});

export const adminAnswerSchema = z.object({
  answer: z.string(),
  chart: adminAnswerChartSchema.nullable(),
  generatedAt: z.string(),
  days: z.number(),
});

export type AdminQuestion = z.infer<typeof adminQuestionSchema>;
export type AdminAnswerChart = z.infer<typeof adminAnswerChartSchema>;
export type AdminAnswer = z.infer<typeof adminAnswerSchema>;
