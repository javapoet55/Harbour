import { parseProjectId } from '@/server/projects';
import { NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma';
import { requireUser } from '@/server/auth';
import { completeTask, deleteTask, scheduleTask, startTask, updateTask, finishFocusWork } from '@/server/tasks';
import { pushTaskToExternal } from '@/server/calendar-sync';
import { scheduleDefaultReminders } from '@/server/reminders';
import { jsonError } from '@/lib/http';
import { zonedDateTime } from '@/lib/time';
import { generateReplanProposal } from '@/server/replanner';
import { prisma } from '@/server/db';
import { inc } from '@/lib/metrics';
import { log } from '@/lib/logger';
import { loadScheduleContext } from '@/server/schedule-intelligence';
import { buildExecutiveRecommendation } from '@/lib/executive-recommendations';
import { randomUUID } from 'node:crypto';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.projectId !== undefined && (body.status !== undefined || body.startAt || body.date || body.focusAction)) {
      return NextResponse.json({ error: 'Save the project assignment separately from status or schedule changes.' }, { status: 400 });
    }
    if (body.focusAction === 'finish') {
      const end = new Date(body.endedAt);
      if ((!body.workSessionId && !body.focusToken) || (body.workSessionId && (typeof body.workSessionId !== 'string' || body.workSessionId.length > 100)) || (body.focusToken && (typeof body.focusToken !== 'string' || body.focusToken.length > 100)) || !Number.isFinite(end.getTime())) return NextResponse.json({ error: 'Invalid focus segment.' }, { status: 400 });
      if (!await prisma.task.findFirst({ where: { id, userId: user.id } })) throw new Error('NOT_FOUND');
      if (body.workSessionId) await finishFocusWork(user.id, id, body.workSessionId, end);
      if (body.focusToken) await prisma.userMemory.deleteMany({ where: { userId: user.id, key: 'runtime:focus', source: `focus:${id}:${body.focusToken}` } });
      else if (body.workSessionId) {
        const state = await prisma.userMemory.findUnique({ where: { userId_key: { userId: user.id, key: 'runtime:focus' } } });
        if (state) {
          try { const focus = JSON.parse(state.value); if (focus.taskId === id && focus.workSessionId === body.workSessionId) await prisma.userMemory.deleteMany({ where: { id: state.id, userId: user.id, value: state.value } }); } catch { /* Ignore invalid operational state. */ }
        }
      }
      return NextResponse.json({ ok: true });
    }
    if (body.status === 'COMPLETED') {
      const task = await completeTask(user.id, id);
      await pushTaskToExternal(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    if (body.status === 'CANCELLED') {
      const task = await deleteTask(user.id, id);
      await pushTaskToExternal(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    if (body.status === 'IN_PROGRESS') {
      if (body.focusMinutes !== undefined) {
        return await prisma.$transaction(async (tx) => {
        const minutes = body.focusMinutes;
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) return NextResponse.json({ error: 'Choose a focus session between 1 and 480 minutes.' }, { status: 400 });
        const owned = await tx.task.findFirst({ where: { id, userId: user.id, deletedAt: null }, include: { dependencies: { select: { dependsOn: { select: { status: true, deletedAt: true } } } } } });
        if (!owned) throw new Error('NOT_FOUND');
        if (!['INBOX', 'PLANNED', 'IN_PROGRESS'].includes(owned.status) || owned.dependencies.some((edge) => edge.dependsOn.status !== 'COMPLETED' && !edge.dependsOn.deletedAt)) return NextResponse.json({ error: 'This task is completed, waiting, or blocked. Refresh your recommendations.' }, { status: 409 });
        if (body.fromRecommendation === true) {
          const context = await loadScheduleContext(user.id, new Date(), 7, tx);
          if (context.contextWarnings.length) return NextResponse.json({ error: 'Synchronize your calendar before starting a recommended session.' }, { status: 409 });
          const { recommendation } = buildExecutiveRecommendation(context, 'FREE_WINDOW', { minutes, candidateTaskIds: [id] });
          if (!recommendation.priorities.some((item) => item.taskId === id && item.focusMinutes >= minutes)) return NextResponse.json({ error: 'Your available window or task changed. Ask for a fresh recommendation.' }, { status: 409 });
        }
        // One global focus timer; a new accepted start closes any older consented segment.
        const previousSegments = await tx.taskWorkSession.findMany({ where: { userId: user.id, endedAt: null }, select: { id: true, startedAt: true } });
        const startedAt = new Date();
        for (const previous of previousSegments) await tx.taskWorkSession.updateMany({ where: { id: previous.id, userId: user.id, endedAt: null }, data: { endedAt: startedAt, durationMin: Math.max(0, Math.round((+startedAt - +previous.startedAt) / 60000)) } });
        const task = await startTask(user.id, id, startedAt, tx);
        const segment = await tx.taskWorkSession.findFirst({ where: { userId: user.id, taskId: id, endedAt: null }, orderBy: { startedAt: 'desc' }, select: { id: true } });
        const focusToken = randomUUID();
        const value = JSON.stringify({ taskId: id, startedAt: +startedAt, endsAt: +startedAt + minutes * 60000, workSessionId: segment?.id ?? null });
        await tx.userMemory.upsert({ where: { userId_key: { userId: user.id, key: 'runtime:focus' } },
          create: { userId: user.id, key: 'runtime:focus', kind: 'runtime', value, source: `focus:${id}:${focusToken}` },
          update: { kind: 'runtime', value, source: `focus:${id}:${focusToken}` } });
        inc('focus_session_started'); log('info', 'focus_session_started', { minutes });
        if (body.fromRecommendation === true) { inc('next_action_accepted'); log('info', 'next_action_accepted'); }
        return NextResponse.json({ task, focus: { minutes, workSessionId: segment?.id ?? null, focusToken } });
        });
      }
      const task = await startTask(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    if (body.status === 'PLANNED') {
      const task = await updateTask(user.id, id, { status: 'PLANNED', completedAt: null });
      await pushTaskToExternal(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    if (body.startAt || body.date) {
      const startAt = body.date
        ? zonedDateTime(String(body.date), String(body.time || '09:00'), user.timeZone)
        : new Date(body.startAt);
      const task = await scheduleTask(user.id, id, startAt, body.durationMin);
      await scheduleDefaultReminders(user.id, id, startAt, Boolean(task.critical));
      await pushTaskToExternal(user.id, id);
      await generateReplanProposal(user.id);
      return NextResponse.json({ task });
    }
    const data: Prisma.TaskUpdateInput = {};
    if (body.projectId !== undefined) {
      const projectId = parseProjectId(body.projectId);
      data.project = projectId === null ? { disconnect: true } : { connect: { id: projectId } };
    }
    if (typeof body.title === 'string') data.title = body.title;
    if (typeof body.notes === 'string') data.notes = body.notes;
    if (typeof body.status === 'string') data.status = body.status;
    if (typeof body.priority === 'string') data.priority = body.priority;
    if (typeof body.waitingOn === 'string' || body.waitingOn === null) data.waitingOn = body.waitingOn;
    if (body.durationMin !== undefined) {
      if (!Number.isInteger(body.durationMin) || body.durationMin < 1 || body.durationMin > 1440) return NextResponse.json({ error: 'Estimate must be 1–1440 minutes.' }, { status: 400 });
      data.durationMin = body.durationMin;
    }
    if (typeof body.splittable === 'boolean') data.splittable = body.splittable;
    if (body.minFocusMin !== undefined) {
      if (!Number.isInteger(body.minFocusMin) || body.minFocusMin < 5 || body.minFocusMin > 120) return NextResponse.json({ error: 'Smallest useful session must be 5–120 minutes.' }, { status: 400 });
      data.minFocusMin = body.minFocusMin;
    }
    if (typeof body.critical === 'boolean') data.critical = body.critical;
    if (['LOW', 'MEDIUM', 'HIGH'].includes(body.energyLevel)) data.energyLevel = body.energyLevel;
    const task = await updateTask(user.id, id, data);
    if (Array.isArray(body.subtasks)) {
      const titles = body.subtasks.map((item: unknown) => typeof item === 'string' ? item.trim() : '').filter(Boolean).slice(0, 50);
      await prisma.$transaction([
        prisma.subtask.deleteMany({ where: { taskId: id, task: { userId: user.id } } }),
        ...titles.map((title: string, sortOrder: number) => prisma.subtask.create({ data: { taskId: id, title, sortOrder } })),
      ]);
    }
    if (body.recurrence === null) await prisma.recurrenceRule.deleteMany({ where: { taskId: id, task: { userId: user.id } } });
    else if (body.recurrence?.frequency && ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(body.recurrence.frequency).toUpperCase())) {
      const recurrence = { frequency: String(body.recurrence.frequency).toUpperCase(), interval: Math.max(1, Number(body.recurrence.interval) || 1), byWeekday: Array.isArray(body.recurrence.byWeekday) ? body.recurrence.byWeekday.join(',') : null, until: body.recurrence.until ? new Date(body.recurrence.until) : null, count: body.recurrence.count ? Math.max(1, Number(body.recurrence.count)) : null };
      await prisma.recurrenceRule.upsert({ where: { taskId: id }, update: recurrence, create: { taskId: id, ...recurrence } });
    }
    if (task.startAt) await pushTaskToExternal(user.id, id);
    await generateReplanProposal(user.id);
    return NextResponse.json({ task });
  } catch (err) {
    return jsonError(err);
  }
}
