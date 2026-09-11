import { NextResponse } from 'next/server';
import { registerAccount } from '@/server/account-auth';
import { writeSession } from '@/server/session';
import { jsonError } from '@/lib/http';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { prisma } from '@/server/db';
import { emailProvider } from '@/providers';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await registerAccount({ name: String(body.name ?? ''), email: String(body.email ?? ''), password: String(body.password ?? '') });
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    await prisma.emailVerificationToken.create({ data: { userId: user.id, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
    await emailProvider.send({ to: user.email, subject: 'Verify your Nexdo email', text: `Your Nexdo verification code is ${code}. It expires in 24 hours.` });
    await writeSession(user.id);
    return NextResponse.json({ id: user.id, name: user.name, email: user.email, emailVerificationRequired: true, ...(process.env.NODE_ENV === 'production' ? {} : { developmentCode: code }) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
