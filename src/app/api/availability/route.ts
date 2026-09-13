import { eventRepeatSchema, eventOccurrences } from '@/server/voice/event-repeat';
import { loadScheduleContext } from '@/server/schedule-intelligence';
import { creationWarnings, normalizedBuffer } from '@/lib/availability';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { checkCreationAvailability } from '@/server/availability';
import { z } from 'zod';
const input = z.object({ startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }), repeat: eventRepeatSchema.optional(), kind: z.enum(['task', 'event']), excludeTaskId: z.string().optional() });
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Invalid schedule.' }, { status: 400 });
    const { startAt, endAt, kind, excludeTaskId, repeat } = parsed.data;
    const start = new Date(startAt), end = new Date(endAt);
    if (+end <= +start || +end - +start > 7 * 86400000) return Response.json({ error: 'Choose an end within seven days of the start.' }, { status: 400 });
    if (repeat) {
      let occurrences;
      try { occurrences = eventOccurrences(start, end, user.timeZone, repeat); }
      catch { return Response.json({ error: 'Invalid repeat settings.' }, { status: 400 }); }
      const from = new Date(+start - 86400000);
      const context = await loadScheduleContext(user.id, from, Math.ceil((+occurrences[occurrences.length - 1].endAt - +from) / 86400000) + 2, undefined, new Date());
      const warnings = [...new Set(occurrences.flatMap(event => creationWarnings(context, event.startAt, event.endAt, kind, excludeTaskId)))];
      const buffer = kind === 'event' ? normalizedBuffer(context.bufferMinutes) * 60000 : 0;
      if (occurrences.some((event, index) => index > 0 && +event.startAt - buffer < +occurrences[index - 1].endAt + buffer)) warnings.push('Occurrences in this series overlap each other, including appointment buffers.');
      return Response.json({ warnings: warnings.length ? [`Review this repeating series: ${warnings.join(' ')}`] : [] }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return Response.json({ warnings: await checkCreationAvailability(user.id, start, end, kind, excludeTaskId) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}
