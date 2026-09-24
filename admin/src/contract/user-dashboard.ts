import { z } from 'zod';
import { adminPlanSchema, trendPointSchema } from './snapshot';

// GET /api/admin/users/:userId: getAdminUserDashboard(userId, 15) on the backend.
const breakdown = z.array(z.object({ label: z.string(), value: z.number() }));

export const adminUserDashboardSchema = z.object({
  range: z.object({ days: z.number(), from: z.string(), to: z.string() }),
  user: z.object({
    id: z.string(), name: z.string(), email: z.string(), initials: z.string(), plan: adminPlanSchema,
    verified: z.boolean(), status: z.string(), createdAt: z.string(), lastActiveAt: z.string(), timeZone: z.string(),
    city: z.string().nullable(), country: z.string().nullable(),
  }),
  metrics: z.object({ aiActions: z.number(), voiceMinutes: z.number(), tasksCreated: z.number(), shoppingLists: z.number() }),
  changes: z.object({ aiActions: z.number(), voiceMinutes: z.number(), tasksCreated: z.number(), shoppingLists: z.number() }),
  trends: z.object({ aiActions: z.array(trendPointSchema), voiceMinutes: z.array(trendPointSchema) }),
  aiBreakdown: breakdown,
  voiceBreakdown: breakdown,
  recentActivity: z.array(z.object({ id: z.string(), date: z.string(), activity: z.string(), details: z.string() })),
  feedback: z.array(z.unknown()),
  device: z.object({
    platform: z.string(), device: z.string(), appVersion: z.string(), pushNotifications: z.string(),
    calendar: z.string(), email: z.string(), voice: z.string(), lastSeen: z.string().nullable(),
  }),
});

export type AdminUserDashboard = z.infer<typeof adminUserDashboardSchema>;

/** Same shape the backend accepts for :userId; anything else is not a user. */
export const isAdminUserId = (value: string) => /^[A-Za-z0-9_-]{1,64}$/.test(value);
