import { prisma } from '@/server/db';
import { normalizeEmail } from '@/server/account-auth';
import { clientAddress, consumeLimit } from '@/server/signup/abuse';
import { jsonError } from '@/lib/http';

// Deliberate signup UX disclosure: return only existence, never account details.
export async function POST(req: Request) {
  try {
    await consumeLimit('signup-email-lookup', clientAddress(req), 30);
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(String(body.email ?? ''));
    const user = await prisma.user.findFirst({ where: { OR: [{ email }, { email: email.toLowerCase() }] }, select: { id: true } });
    return Response.json({ exists: !!user }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
