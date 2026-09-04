import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { readUserId } from './session';

export async function login(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase(), deletedAt: null },
  });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

export async function currentUser() {
  const id = await readUserId();
  if (!id) return null;
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { preference: true },
  });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}
