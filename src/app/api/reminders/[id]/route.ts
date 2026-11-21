import { NextResponse } from 'next/server';
import { healthRoute } from '@/server/health/telemetry';
import { jsonError } from '@/lib/http';
import { requireUser } from '@/server/auth';
import { removeReminder, updateReminder } from '@/server/reminder-history';

type Ctx = { params: Promise<{ id: string }> };

/** Edit a reminder's text, time and pop-up / email / call choices. */
async function patch(request: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    return NextResponse.json({ reminder: await updateReminder(user.id, id, await request.json()) });
  } catch (error) { return jsonError(error); }
}
/** Delete a reminder; anything still scheduled for it is cancelled. */
async function remove(_request: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    return NextResponse.json(await removeReminder(user.id, id));
  } catch (error) { return jsonError(error); }
}
export const PATCH = healthRoute('PATCH /api/reminders/[id]', patch);
export const DELETE = healthRoute('DELETE /api/reminders/[id]', remove);
