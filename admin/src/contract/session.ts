import { z } from 'zod';

// Responses of POST /api/admin/session and GET /api/admin/me on the backend.
export const adminUserSchema = z.object({ id: z.string().min(1), name: z.string(), email: z.string() });
export const adminSessionSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime(),
  user: adminUserSchema,
});
export const adminMeSchema = adminUserSchema.extend({ canOperate: z.boolean() });
export const backendErrorSchema = z.object({ error: z.string() });

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminSession = z.infer<typeof adminSessionSchema>;
export type AdminMe = z.infer<typeof adminMeSchema>;
