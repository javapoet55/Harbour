import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { jsonError } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireUser();
    const connections = await prisma.calendarConnection.findMany({
      where: { userId: user.id },
      select: { id: true, provider: true, accountEmail: true, calendarId: true, calendarName: true, visible: true, writeEnabled: true, status: true, lastSyncedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ connections, defaultCalendarId: user.preference?.defaultCalendarId });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const connection = await prisma.calendarConnection.findFirst({ where: { id: String(body.id), userId: user.id } });
    if (!connection) throw new Error('NOT_FOUND');
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { visible: typeof body.visible === 'boolean' ? body.visible : undefined, writeEnabled: typeof body.writeEnabled === 'boolean' ? body.writeEnabled : undefined },
    });
    if (body.makeDefault === true) await prisma.userPreference.update({ where: { userId: user.id }, data: { defaultCalendarId: connection.id } });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get('id');
    const connection = await prisma.calendarConnection.findFirst({ where: { id: id || '', userId: user.id } });
    if (!connection) throw new Error('NOT_FOUND');
    await prisma.$transaction([
      prisma.calendarEvent.deleteMany({ where: { connectionId: connection.id, userId: user.id } }),
      prisma.calendarConnection.delete({ where: { id: connection.id } }),
      ...(user.preference?.defaultCalendarId === connection.id
        ? [prisma.userPreference.update({ where: { userId: user.id }, data: { defaultCalendarId: null } })]
        : []),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
