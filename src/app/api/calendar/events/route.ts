import { eventRepeatSchema, eventOccurrences } from '@/server/voice/event-repeat';
import { createHash } from 'node:crypto';
import { requireUser } from '@/server/auth';
import { executeVoiceTool, validateVoiceTool } from '@/server/voice/tools';
import { z } from 'zod';
const input = z.object({ repeat: eventRepeatSchema.optional(), requestId: z.string().uuid(), title: z.string(), notes: z.string(), startAt: z.string(), endAt: z.string(), location: z.string() }).strict();
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = input.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ error: 'Invalid event details.' }, { status: 400 });
    const { requestId, repeat, ...event } = body.data;
    try { validateVoiceTool('create_calendar_event', { ...event, allowScheduleConflict: true }); }
    catch { return Response.json({ error: 'Invalid event details.' }, { status: 400 }); }
    if (+new Date(event.startAt) <= Date.now() || +new Date(event.endAt) <= +new Date(event.startAt) || +new Date(event.endAt) - +new Date(event.startAt) > 7 * 86400000) return Response.json({ error: 'Choose a future start and an end within seven days.' }, { status: 400 });
    if (repeat) {
      let occurrences;
      try { occurrences = eventOccurrences(new Date(event.startAt), new Date(event.endAt), user.timeZone, repeat); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid repeat settings.' }, { status: 400 }); }
      const { prisma } = await import('@/server/db');
      const seriesKey = createHash('sha256').update(`${user.id}:${requestId}`).digest('hex');
      await prisma.$transaction(async tx => {
        for (const occurrence of occurrences) {
          const syncKey = `manual-repeat:${seriesKey}:${occurrence.startAt.toISOString()}`;
          await tx.calendarEvent.upsert({ where: { syncKey }, update: {}, create: { userId: user.id, title: event.title, notes: event.notes, location: event.location, ...occurrence, timeZone: user.timeZone, source: 'harbor', syncKey } });
        }
      }, { timeout: 20000 });
      return Response.json({ success: true, occurrenceCount: occurrences.length }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return Response.json(await executeVoiceTool(user.id, requestId, 'manual-calendar-event', 'create_calendar_event', { ...event, allowScheduleConflict: true }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Sign in required.' : 'Could not confirm the event. Check your calendar before trying again.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
