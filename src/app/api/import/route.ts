import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { createTask } from '@/server/tasks';
import { jsonError } from '@/lib/http';

export async function POST(req: Request) { try { const user = await requireUser(); const body = await req.json(); const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 500) : []; let imported = 0; for (const item of tasks) { if (!item || typeof item.title !== 'string' || !item.title.trim()) continue; await createTask({ userId: user.id, title: item.title.trim().slice(0, 300), notes: typeof item.notes === 'string' ? item.notes : undefined, priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(item.priority) ? item.priority : undefined, durationMin: Number.isFinite(item.durationMin) ? Math.max(1, Math.min(1440, Number(item.durationMin))) : undefined, status: 'PLANNED' }); imported++; } return NextResponse.json({ imported }); } catch (error) { return jsonError(error); } }
