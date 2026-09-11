import { NextResponse } from 'next/server';
import { verifyEmail } from '@/server/account-auth';
import { jsonError } from '@/lib/http';
export async function POST(req: Request) { try { const body = await req.json(); await verifyEmail(String(body.email ?? ''), String(body.code ?? '')); return NextResponse.json({ ok: true }); } catch (error) { return jsonError(error); } }
