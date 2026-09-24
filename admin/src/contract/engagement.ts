import { z } from 'zod';

// GET /api/admin/engagement: getFirebaseEngagement() on the backend.
export const engagementRowSchema = z.object({ label: z.string(), values: z.record(z.string(), z.number()) });

export const firebaseEngagementSchema = z.object({
  propertyId: z.string(),
  streamId: z.string().optional(),
  from: z.string(),
  to: z.string(),
  fetchedAt: z.string(),
  timeZone: z.string(),
  summary: z.record(z.string(), z.number()),
  daily: z.array(engagementRowSchema),
  events: z.array(engagementRowSchema),
  screens: z.array(engagementRowSchema),
  versions: z.array(engagementRowSchema),
  limited: z.boolean(),
});

export const engagementResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('connected'), data: firebaseEngagementSchema }),
  z.object({ status: z.enum(['not_configured', 'unavailable']), message: z.string() }),
]);

export type EngagementRow = z.infer<typeof engagementRowSchema>;
export type FirebaseEngagement = z.infer<typeof firebaseEngagementSchema>;
export type EngagementResult = z.infer<typeof engagementResultSchema>;
