import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAdmin } from '@/server/admin-auth';
import { adminQuestionSchema, answerAdminAnalyticsQuestion } from '@/server/admin-insights';
import { parseAdminDateRange } from '@/lib/admin-date-range';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const { question, days, from, to } = adminQuestionSchema.parse(await request.json().catch(() => null));
    const range = from && to ? parseAdminDateRange(from, to) : undefined;
    const result = await answerAdminAnalyticsQuestion(admin.id, question, days, range ? { from: range.fromDate, to: range.toDate } : undefined);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Enter a valid question.' }, { status: 400 });
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Super Admin access is required.' }, { status: 403 });
    if (error instanceof Error && error.message === 'OPENAI_NOT_CONFIGURED') return NextResponse.json({ error: 'Admin AI is not configured.' }, { status: 503 });
    if (error instanceof Error && error.message === 'OPENAI_ADMIN_UNAVAILABLE') return NextResponse.json({ error: 'Admin AI is temporarily unavailable. Try again.' }, { status: 502 });
    return NextResponse.json({ error: 'The usage question could not be answered.' }, { status: 500 });
  }
}
