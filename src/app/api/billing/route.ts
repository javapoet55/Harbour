import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { jsonError } from '@/lib/http';

const plans = ['FREE', 'PRO', 'MAX'] as const;
export async function GET() { try { const user = await requireUser(); const memory = await prisma.userMemory.findUnique({ where: { userId_key: { userId: user.id, key: 'billing:plan' } } }); return NextResponse.json({ plan: memory?.value || 'FREE', plans }); } catch (error) { return jsonError(error); } }
export async function POST(req: Request) { try { const user = await requireUser(); const body = await req.json().catch(() => ({})); const plan = String(body.plan || '').toUpperCase(); if (!plans.includes(plan as typeof plans[number])) return NextResponse.json({ error: 'Choose a valid plan.' }, { status: 400 }); await prisma.userMemory.upsert({ where: { userId_key: { userId: user.id, key: 'billing:plan' } }, create: { userId: user.id, key: 'billing:plan', value: plan, kind: 'billing', source: 'billing' }, update: { value: plan } }); return NextResponse.json({ plan, message: plan === 'FREE' ? 'You are on the Free plan.' : 'Plan selected. Connect a payment provider to enable checkout.' }); } catch (error) { return jsonError(error); } }
