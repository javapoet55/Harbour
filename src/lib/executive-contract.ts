import { z } from 'zod';

export const EXECUTIVE_INTENTS = ['FOCUS_TODAY', 'FIX_SCHEDULE', 'DRIVING_BRIEFING', 'FREE_WINDOW', 'NEXT_ACTION', 'COMPARE_TASKS'] as const;
export type ExecutiveIntent = typeof EXECUTIVE_INTENTS[number];

const prioritySchema = z.object({
  taskId: z.string(), title: z.string(), score: z.number(), reasons: z.array(z.string()),
  durationMin: z.number(), focusMinutes: z.number().int().nonnegative(), partial: z.boolean(),
  deadlineRisk: z.number(), slackMinutes: z.number().nullable(), dueAt: z.string().nullable(),
  windowFit: z.number().min(0).max(100).optional(), dependencyImpact: z.number().optional(),
  switchingCost: z.number().nonnegative().optional(), baseScore: z.number().min(0).max(100).optional(),
});
export const executiveRecommendationSchema = z.object({
  intent: z.enum(EXECUTIVE_INTENTS), summary: z.string(), conversationalSummary: z.string(),
  spoken: z.string().max(4000), generatedAt: z.string(), timeZone: z.string(),
  priorities: z.array(prioritySchema), risks: z.array(z.object({ title: z.string(), explanation: z.string() })),
  conflicts: z.array(z.object({ id: z.string(), title: z.string(), explanation: z.string(), recommendedAction: z.string() })),
  reasoning: z.array(z.string()), recommendedActions: z.array(z.object({
    type: z.enum(['START_FOCUS', 'REVIEW_PLAN']), label: z.string(), taskId: z.string().optional(), durationMin: z.number().int().positive().optional(),
  })),
  proposedScheduleChanges: z.array(z.object({ taskId: z.string(), title: z.string(), before: z.string().nullable(), after: z.string(), durationMin: z.number(), reason: z.string() })),
  fixedCommitments: z.array(z.object({ id: z.string(), title: z.string(), startAt: z.string(), endAt: z.string(), allDay: z.boolean() })),
  requiresApproval: z.boolean(), confidence: z.number().min(0).max(1),
  window: z.object({ startAt: z.string(), endAt: z.string(), requestedMinutes: z.number().nullable(), availableMinutes: z.number(), requiredMinutes: z.number(), deficitMinutes: z.number() }),
  assumptions: z.array(z.string()), sections: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
  nextAction: z.object({ bestAction: prioritySchema.nullable(), alternatives: z.array(prioritySchema),
    outsideWorkingHours: z.boolean().optional(),
    remainingWorkingMinutesToday: z.number().nonnegative().optional(),
    availableWindowMinutes: z.number().nonnegative(), suggestedFocusDuration: z.number().nonnegative(),
    proactive: z.boolean(), continuingFocus: z.boolean(), confidence: z.number().min(0).max(1),
  }).optional(),
});
export type ExecutiveRecommendation = z.infer<typeof executiveRecommendationSchema>;

export const assistantRequestSchema = z.object({
  transcript: z.string().trim().max(4000).default(''),
  confirmActionId: z.string().min(1).max(100).optional(),
  rejectActionId: z.string().min(1).max(100).optional(),
  contextActionId: z.string().min(1).max(100).optional(),
}).refine((body) => Boolean(body.transcript || body.confirmActionId || body.rejectActionId), 'Say or type something first.')
  .refine((body) => !(body.confirmActionId && body.rejectActionId), 'Choose apply or reject, not both.');
