import { healthRoute } from '@/server/health/telemetry';
import { jsonError } from '@/lib/http';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { pushEventToExternal } from '@/server/calendar-sync';
import { calendarPushMessage, calendarPushWarning } from '@/lib/calendar-push';
import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const input = z.object({ title: z.string().trim().min(1).max(200).optional(), notes: z.string().max(4000).optional(), location: z.string().max(200).optional(), startAt: timestamp.optional(), endAt: timestamp.optional() }).strict();
const selection = { id: true, title: true, notes: true, location: true, startAt: true, endAt: true, timeZone: true } as const;
const noStore = { 'Cache-Control': 'private, no-store' };

// Only events created in Nexdo are edited here; imported events belong to their provider.
function ownedEvent(userId: string, id: string) {
  return prisma.calendarEvent.findFirst({ where: { id, userId, source: 'harbor', connectionId: null, deletedAt: null } });
}

async function healthHandlerPATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = input.safeParse(await req.json().catch(() => null));
    if (!body.success || !Object.keys(body.data).length) return Response.json({ error: 'Invalid event details.' }, { status: 400 });
    const existing = await ownedEvent(user.id, id);
    if (!existing) throw new Error('NOT_FOUND');
    const startAt = body.data.startAt ? new Date(body.data.startAt) : existing.startAt;
    const endAt = body.data.endAt ? new Date(body.data.endAt) : existing.endAt;
    const retimed = body.data.startAt !== undefined || body.data.endAt !== undefined;
    if (retimed && (+startAt <= Date.now() || +endAt <= +startAt || +endAt - +startAt > 7 * 86400000)) return Response.json({ error: 'Choose a future start and an end within seven days.' }, { status: 400 });
    const changed = await prisma.calendarEvent.updateMany({ where: { id, userId: user.id, deletedAt: null }, data: { ...body.data, startAt, endAt } });
    if (changed.count !== 1) throw new Error('NOT_FOUND');
    const event = await prisma.calendarEvent.findUniqueOrThrow({ where: { id }, select: selection });
    const calendarPush = await pushEventToExternal(user.id, id);
    const warning = calendarPushWarning(calendarPush, 'updated');
    return Response.json({ success: true, event, calendarPush, ...(warning ? { warnings: [warning] } : {}), message: calendarPushMessage(calendarPush, 'updated') }, { headers: noStore });
  } catch (error) { return jsonError(error); }
}

async function healthHandlerDELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!await ownedEvent(user.id, id)) throw new Error('NOT_FOUND');
    await prisma.calendarEvent.updateMany({ where: { id, userId: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
    const calendarPush = await pushEventToExternal(user.id, id);
    const warning = calendarPushWarning(calendarPush, 'deleted');
    return Response.json({ success: true, calendarPush, ...(warning ? { warnings: [warning] } : {}), message: calendarPushMessage(calendarPush, 'deleted') }, { headers: noStore });
  } catch (error) { return jsonError(error); }
}

export const PATCH = healthRoute('PATCH /api/calendar/events/[id]', healthHandlerPATCH);

export const DELETE = healthRoute('DELETE /api/calendar/events/[id]', healthHandlerDELETE);
