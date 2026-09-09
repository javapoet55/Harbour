import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { clearSession } from '@/server/session';
import { revokeAppleIdentity } from '@/server/apple-auth';
import { jsonError } from '@/lib/http';

export async function DELETE() {
  try {
    const user = await requireUser();
    const apple = await prisma.authIdentity.findFirst({ where: { userId: user.id, provider: 'apple' } });
    if (apple?.refreshToken) await revokeAppleIdentity(apple.refreshToken);
    await prisma.user.delete({ where: { id: user.id } });
    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
