import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { clearSession } from '@/server/session';
import { validatePassword } from '@/server/account-auth';
import { healthRoute } from '@/server/health/telemetry';
import { jsonError } from '@/lib/http';

const input = z.object({ currentPassword: z.string().min(1).max(72), newPassword: z.string().min(12).max(72), confirmPassword: z.string().min(12).max(72) });
async function changePassword(req: Request) {
  try {
    const user = await requireUser();
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter your current password and a new password of at least 12 characters.' }, { status: 400 });
    const { currentPassword, newPassword, confirmPassword } = parsed.data;
    if (newPassword !== confirmPassword) return NextResponse.json({ error: 'The new passwords do not match.' }, { status: 400 });
    validatePassword(newPassword);
    if (!user.passwordHash) return NextResponse.json({ error: 'This account uses a sign-in provider. Use password reset to set a password first.' }, { status: 400 });
    if (Buffer.byteLength(currentPassword, 'utf8') > 72 || !await bcrypt.compare(currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 400 });
    }
    if (currentPassword === newPassword) return NextResponse.json({ error: 'Choose a different new password.' }, { status: 400 });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const changed = await prisma.user.updateMany({ where: { id: user.id, deletedAt: null, passwordHash: user.passwordHash }, data: { passwordHash } });
    if (changed.count !== 1) return NextResponse.json({ error: 'Your password changed during this request. Sign in again and retry.' }, { status: 409 });
    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
export const POST = healthRoute('POST /api/auth/change-password', changePassword);
