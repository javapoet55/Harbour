import { NextResponse } from 'next/server';
import { currentUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { NEXT_ACTION_POLICY } from '@/lib/next-action-config';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  const memories = await prisma.userMemory.findMany({ where: { userId: user.id, key: { in: ['preference:next_action_enabled', 'preference:switching_threshold'] } }, select: { key: true, value: true } });
  const settings = new Map(memories.map((item) => [item.key, item.value]));
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      photo: user.photo,
      email: user.email,
      timeZone: user.timeZone,
      preference: user.preference,
      nextAction: { enabled: settings.get('preference:next_action_enabled') === 'true', switchingThreshold: Number(settings.get('preference:switching_threshold') ?? NEXT_ACTION_POLICY.switchingThreshold) },
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
