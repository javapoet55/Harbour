import { z } from 'zod';

// GET /api/admin/snapshot: getAdminSnapshot() on the backend. Dates arrive as ISO strings.
export const adminPlanSchema = z.enum(['FREE', 'PRO', 'MAX']);
export const trendPointSchema = z.object({ label: z.string(), value: z.number() });
export const voiceRecordSchema = z.object({
  id: z.string(), user: z.string(), date: z.string(), minutes: z.number().nullable(), type: z.string(), status: z.string(),
});

export const adminSnapshotUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  plan: adminPlanSchema,
  city: z.string().nullable(),
  country: z.string().nullable(),
  timeZone: z.string(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  aiActions: z.number(),
  voiceMinutes: z.number(),
  verified: z.boolean(),
  activeInPeriod: z.boolean(),
  estimatedMonthlyRevenue: z.number(),
});

export const adminSnapshotSchema = z.object({
  generatedAt: z.string(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
  days: z.number(),
  metrics: z.object({
    totalUsers: z.number(), newUsers: z.number(), activeUsers: z.number(), aiActions: z.number(),
    voiceMinutes: z.number(), voiceSessions: z.number(), estimatedMrr: z.number(), verifiedUsers: z.number(),
  }),
  changes: z.object({ newUsers: z.number(), aiActions: z.number(), voiceMinutes: z.number() }),
  planCounts: z.object({ FREE: z.number(), PRO: z.number(), MAX: z.number() }),
  users: z.array(adminSnapshotUserSchema),
  featureCounts: z.array(z.object({ label: z.string(), value: z.number(), color: z.string() })),
  trends: z.object({
    signups: z.array(trendPointSchema), totalUsers: z.array(trendPointSchema),
    aiActions: z.array(trendPointSchema), voiceMinutes: z.array(trendPointSchema),
  }),
  actionRecords: z.array(z.object({ id: z.string(), user: z.string(), intent: z.string(), executed: z.boolean(), date: z.string() })),
  voiceRecords: z.array(voiceRecordSchema),
  recentVoice: z.array(voiceRecordSchema),
});

export type AdminPlan = z.infer<typeof adminPlanSchema>;
export type TrendPoint = z.infer<typeof trendPointSchema>;
export type VoiceRecord = z.infer<typeof voiceRecordSchema>;
export type AdminSnapshotUser = z.infer<typeof adminSnapshotUserSchema>;
export type AdminSnapshot = z.infer<typeof adminSnapshotSchema>;
