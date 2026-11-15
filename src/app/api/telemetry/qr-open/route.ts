import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
const eventSchema = z.object({
  openedAt: z.iso.datetime(),
  platform: z.enum(['android', 'ios', 'other']),
  model: nullableText(80),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  region: nullableText(16),
  city: nullableText(120),
}).strict();
const digest = (value: string) => createHash('sha256').update(value).digest();

export async function POST(request: Request) {
  const secret = process.env.QR_ANALYTICS_TOKEN;
  if (!secret) return new Response(null, { status: 503 });
  if (!timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))) {
    return new Response(null, { status: 401 });
  }

  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const decoder = new TextDecoder();
  let json = '';
  let size = 0;
  let raw: unknown;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      json += decoder.decode(value, { stream: true });
    }
    raw = JSON.parse(json + decoder.decode());
  } catch {
    return new Response(null, { status: 400 });
  }
  const event = eventSchema.safeParse(raw);
  if (!event.success) return new Response(null, { status: 400 });
  const openedAt = new Date(event.data.openedAt);
  if (!Number.isFinite(+openedAt) || Math.abs(Date.now() - +openedAt) > 300_000) {
    return new Response(null, { status: 400 });
  }
  await prisma.qrOpen.create({ data: { ...event.data, openedAt, openedDay: openedAt.toISOString().slice(0, 10) } });
  return new Response(null, { status: 204 });
}
