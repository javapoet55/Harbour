import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { syncConnection } from '@/server/calendar-sync';

export async function POST() {
  const user = await requireUser();
  const connections = await prisma.calendarConnection.findMany({ where: { userId: user.id } });
  const results = [];
  for (const connection of connections) {
    results.push({ id: connection.id, ...(await syncConnection(user.id, connection.id)) });
  }
  return NextResponse.json({ results });
}
