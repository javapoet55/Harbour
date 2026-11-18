import { z } from 'zod';

const platform = z.enum(['android', 'ios', 'other']);
const count = z.number().int().nonnegative();
const location = z.object({
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
});
const device = z.object({ platform, model: z.string().nullable() });

export const qrAnalyticsSchema = z.object({
  total: count,
  days: z.array(z.object({ day: z.string(), count })),
  platforms: z.array(z.object({ platform, count })),
  locations: z.array(location.extend({ count })),
  devices: z.array(device.extend({ count })),
  recent: z.array(location.merge(device).extend({ id: z.string(), openedAt: z.iso.datetime() })),
});
