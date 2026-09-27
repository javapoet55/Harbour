import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { createTask } from '@/server/tasks';
import { jsonError } from '@/lib/http';
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const event = await prisma.calendarEvent.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!event) throw new Error('NOT_FOUND');
    const task = await createTask({
      userId: user.id, title: event.title, notes: event.notes ?? undefined, dueAt: event.startAt,
      durationMin: Math.max(1, Math.min(1440, Math.round((+event.endAt - +event.startAt) / 60000))),
      idempotencyKey: 'calendar-task:' + event.id,
    });
    return Response.json({ success: true, taskId: task.id }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}
