import { NextResponse } from 'next/server';
import { clearSession } from '@/server/session';

import { clearAdminSession } from '@/server/admin-session';

export async function POST() {
  await clearAdminSession();
  await clearSession();
  return NextResponse.json({ ok: true });
}
