import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { syncConnection } from '@/server/calendar-sync';
import { jsonError } from '@/lib/http';
import { generateReplanProposal } from '@/server/replanner';

async function healthHandlerPOST(req: Request) {
  try {
    const cronSecret = process.env.HARBOR_CRON_SECRET;
    const isCron = Boolean(cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`);
    const user = isCron ? null : await requireUser();
    const connections = await prisma.calendarConnection.findMany({ where: user ? { userId: user.id } : {} });
    const results: Array<Record<string, unknown>> = [];
    for (const connection of connections) {
      try { results.push({ id: connection.id, userId: connection.userId, ...(await syncConnection(connection.userId, connection.id)) }); }
      catch (error) { results.push({ id: connection.id, userId: connection.userId, error: error instanceof Error ? error.message : 'Sync failed' }); }
    }
    const userIds = [...new Set(user ? [user.id] : connections.map((connection) => connection.userId))];
    const replans = [];
    for (const userId of userIds) {
      const replan = await generateReplanProposal(userId);
      replans.push({ userId, changes: replan.moves.length, risks: replan.risks.length });
    }
    return NextResponse.json({ results, replans });
  } catch (error) { return jsonError(error); }
}

export const POST = healthRoute('POST /api/calendar/sync', healthHandlerPOST);
