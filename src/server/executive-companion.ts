import { prisma } from './db';
import { loadScheduleContext } from './schedule-intelligence';
import { applyReplanProposal, rejectReplanProposal, scheduleContextVersion, storeExecutiveProposal } from './replanner';
import { buildExecutiveRecommendation, type ExecutiveOptions } from '@/lib/executive-recommendations';
import { executiveRecommendationSchema, type ExecutiveIntent } from '@/lib/executive-contract';
import { parseIntent } from '@/lib/intent';
import type { AssistantTurn } from './assistant';
import { inc, observeMs } from '@/lib/metrics';
import { log } from '@/lib/logger';
import { addDays, endOfLocalDay, formatTime, startOfLocalDay, tzToday, ymd, zonedDateTime } from '@/lib/time';
import { NEXT_ACTION_POLICY, suppressNextAction } from '@/lib/next-action-config';
import { workWindows } from '@/lib/replanning';

/** Conservative title resolution. Ambiguous/missing candidates require clarification, never invented IDs. */
export function resolveComparison(text: string, tasks: Array<{ id: string; title: string }>) {
  const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((word) => word && !['should', 'i', 'my', 'the', 'a', 'an', 'for', 'to', 'or', 'finish', 'prepare', 'answer', 'complete', 'work', 'on'].includes(word));
  const clauses = text.replace(/^.*?should i\s+/i, '').replace(/[?.!]$/, '').split(/,|\bor\b/i).map((item) => item.trim()).filter(Boolean);
  if (clauses.length < 2 || clauses.length > 8) return null;
  const ids: string[] = [];
  for (const clause of clauses) {
    const tokens = words(clause);
    const exact = tasks.filter((task) => task.title.toLowerCase() === clause.toLowerCase());
    const matches = exact.length ? exact : tasks.filter((task) => tokens.length > 0 && tokens.every((token) => words(task.title).includes(token)));
    if (matches.length !== 1) return null;
    ids.push(matches[0].id);
  }
  return [...new Set(ids)].length >= 2 ? [...new Set(ids)] : null;
}

function simpleTurn(transcript: string, spoken: string): AssistantTurn {
  return { transcript, spoken, intent: parseIntent(transcript), visual: { summary: spoken, appointments: [], tasks: [], overdue: [], next: '', rangeLabel: 'Executive companion' } };
}

async function lastExecutiveTurn(userId: string, contextActionId?: string) {
  const last = await prisma.assistantAction.findFirst({ where: { userId, ...(contextActionId ? { id: contextActionId } : {}), intent: { not: 'CONTINUOUS_REPLAN' }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  if (!last || last.intent !== 'EXECUTIVE_READ') return null;
  try {
    const parsed = executiveRecommendationSchema.safeParse(JSON.parse(last.resultJson));
    if (!parsed.success) return null;
    const payload = JSON.parse(last.payloadJson) as { options?: ExecutiveOptions; actionId?: string | null };
    return { id: last.id, recommendation: parsed.data, options: payload.options ?? {}, actionId: payload.actionId ?? null };
  } catch { return null; }
}

/** One conversational adapter over existing schedule engines, voice sessions and actions. */
export async function handleExecutiveTurn(userId: string, transcript: string, control: { confirmActionId?: string; rejectActionId?: string; contextActionId?: string } = {}, explain?: (userId: string, recommendation: import('@/lib/executive-contract').ExecutiveRecommendation) => Promise<string | null>): Promise<AssistantTurn | null> {
  const started = Date.now();
  const parsed = parseIntent(transcript);
  const text = transcript.toLowerCase().replace(/[’]/g, "'").trim();
  const direct = ['FOCUS_TODAY', 'FIX_SCHEDULE', 'DRIVING_BRIEFING', 'FREE_WINDOW', 'NEXT_ACTION', 'COMPARE_TASKS'].includes(parsed.intent);
  const alternative = /^(?:give me another (?:one|task)|(?:i )?(?:don't|do not) want to work on that)[.!?]?$/.test(text);
  const follow = alternative || /^(why\??|why that(?: one| task)?\??|tell me about (?:the|that) conflict[.!?]?|what can wait[.!?]?|what(?:'s| is) my first meeting[.!?]?|(?:please )?(?:don't|do not) move .+|move anything nonessential tomorrow morning[.!?]?|(?:yes|apply(?: (?:the )?plan)?|no|cancel|reject|keep (?:my|the) current plan)[.!?]?)$/i.test(text);
  if (!direct && !follow && !control.confirmActionId && !control.rejectActionId) return null;
  const prior = follow ? await lastExecutiveTurn(userId, control.contextActionId) : null;
  if (follow && control.contextActionId && !prior) throw new Error('NOT_FOUND');
  const reply = (message: string) => ({ ...simpleTurn(transcript, message), ...(prior ? { contextActionId: prior.id } : {}) });
  let actionId = control.confirmActionId ?? control.rejectActionId;
  const rejects = Boolean(control.rejectActionId) || /^(no|cancel|reject|keep)/.test(text);
  const approves = Boolean(control.confirmActionId) || /^(yes|apply)/.test(text);
  const another = alternative || Boolean(rejects && prior?.recommendation.nextAction && !prior.actionId && !control.rejectActionId);
  if (!actionId && (rejects || approves)) actionId = prior?.actionId ?? undefined;
  if (actionId) {
    const action = await prisma.assistantAction.findFirst({ where: { id: actionId, userId, intent: { in: ['EXECUTIVE_REPLAN', 'CONTINUOUS_REPLAN'] } } });
    if (!action) {
      if (control.rejectActionId) {
        const result = await prisma.assistantAction.updateMany({ where: { id: actionId, userId, executed: false }, data: { executed: true, confirmation: 'REJECTED' } });
        if (result.count !== 1) throw new Error('NOT_FOUND');
        return simpleTurn(transcript, 'Kept your current plan. No changes were applied.');
      }
      return null;
    }
    if (rejects) { await rejectReplanProposal(userId, actionId); return simpleTurn(transcript, 'Kept your current plan. No tasks or calendar events were changed.'); }
    const result = await applyReplanProposal(userId, actionId);
    return simpleTurn(transcript, `Applied ${result.moved} approved task changes. Fixed calendar appointments were preserved.${result.externalSyncFailures ? ` ${result.externalSyncFailures} calendar or reminder updates failed; Nexdo task changes were saved.` : ''}`);
  }
  if (!direct && !prior) return null;
  if (!direct && (rejects || approves) && !another) return simpleTurn(transcript, 'There is no pending schedule proposal to apply. Ask me to fix your afternoon first.');

  inc('executive_companion_query'); inc('intent_detected');
  const intent = (direct ? parsed.intent : /don't move|do not move|move anything/.test(text) ? 'FIX_SCHEDULE' : prior!.recommendation.intent) as ExecutiveIntent;
  log('info', 'executive_companion_query', { intent }); log('info', 'intent_detected', { intent });
  const contextVersion = intent === 'FIX_SCHEDULE' ? await scheduleContextVersion(userId) : undefined;
  const context = await loadScheduleContext(userId);
  if (direct && intent === 'FIX_SCHEDULE' && /meeting (?:ran|runs|is running).*late/.test(text)) {
    return simpleTurn(transcript, 'I can rebuild the rest of your day, but first I need the meeting’s updated end time in your calendar. Update or synchronize that event, then ask “Fix my afternoon.” I have not changed any tasks or appointments.');
  }
  const options: ExecutiveOptions = direct ? { minutes: parsed.durationMin, period: /rest of|remaining|fix my day|fix my schedule|everything fit/.test(text) ? 'remaining' : 'afternoon' } : { ...prior!.options };
  options.proactive = false;
  if (['NEXT_ACTION', 'COMPARE_TASKS', 'FREE_WINDOW'].includes(intent)) { inc('next_action_requested'); log('info', 'next_action_requested', { intent }); }
  if (intent === 'COMPARE_TASKS' && direct) {
    const ids = resolveComparison(transcript, context.tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status)));
    if (!ids) return simpleTurn(transcript, 'Which exact task titles should I compare? I could not uniquely match every choice to your open tasks. I will not assume a task is preparation for a meeting.');
    options.candidateTaskIds = ids;
  }
  if (another) {
    const previousTask = prior?.recommendation.priorities[0]?.taskId;
    options.excludedTaskIds = [...new Set([...(options.excludedTaskIds ?? []), ...(previousTask ? [previousTask] : [])])];
    inc('next_action_rejected'); inc('next_action_alternative_requested'); log('info', 'next_action_rejected'); log('info', 'next_action_alternative_requested');
  }
  if (text.includes('move anything nonessential tomorrow morning')) options.period = 'tomorrow_morning';
  if (/don't move|do not move/.test(text)) {
    const target = text.replace(/^.*?(?:don't|do not) move\s+/, '').replace(/[.!?]+$/, '').replace(/^(?:the|my)\s+/, '');
    const matches = [...context.tasks, ...context.events].filter((item) => item.title.toLowerCase().includes(target));
    if (target === 'that meeting') options.protectedTaskIds = prior!.options.protectedTaskIds ?? [];
    else if (matches.length !== 1) {
      if (prior?.actionId) await prisma.assistantAction.updateMany({ where: { id: prior.actionId, userId, executed: false }, data: { executed: true, confirmation: 'SUPERSEDED' } });
      return simpleTurn(transcript, 'Which exact task or appointment should stay put? I have not applied any changes.');
    } else options.protectedTaskIds = [...new Set([...(prior?.options.protectedTaskIds ?? []), matches[0].id])];
  }
  const { recommendation, plan } = buildExecutiveRecommendation(context, intent, options);
  if (another) recommendation.assumptions.push('Previous choices are excluded only in this conversation; a new direct question resets the exclusion. No tasks were changed.');
  if (intent === 'COMPARE_TASKS') {
    const considered = context.tasks.filter((task) => options.candidateTaskIds?.includes(task.id));
    recommendation.sections.push({ title: 'Comparison scope', items: considered.map((task) => `${task.title}: ${recommendation.priorities.some((item) => item.taskId === task.id) ? 'ranked above using saved priority, deadline, duration and dependencies' : options.excludedTaskIds?.includes(task.id) ? 'temporarily excluded by you' : 'blocked, waiting, or unable to fit this opening'}`) });
  }
  if (!direct && /^why/.test(text)) {
    const task = prior?.recommendation.priorities[0];
    const refreshed = recommendation.priorities.find((item) => item.taskId === task?.taskId);
    return reply(refreshed ? `${refreshed.title} was recommended because ${refreshed.reasons.join('; ')}.` : 'That recommendation is no longer among the current actionable priorities. Ask for an updated focus list.');
  }
  if (!direct && /tell me about.*conflict/.test(text)) return reply(recommendation.conflicts.length ? recommendation.conflicts.slice(0, 2).map((item) => `${item.explanation} ${item.recommendedAction}`).join(' ') : 'There are no remaining conflicts in your saved schedule.');
  if (!direct && /what can wait/.test(text)) {
    const todayEnd = endOfLocalDay(ymd(tzToday(context.timeZone, context.now)), context.timeZone);
    const waiting = context.tasks.filter((task) => ['INBOX', 'PLANNED'].includes(task.status) && !task.critical && !['HIGH', 'CRITICAL'].includes(task.priority) && !task.blocksCount && (!task.dueAt || task.dueAt > todayEnd));
    return reply(waiting.length ? `Consider deferring ${waiting.slice(0, 3).map((task) => task.title).join(', ')}. These are lower priority, do not unblock other work, and have no deadline today. Nothing has moved.` : 'No lower-priority work is clearly safe to defer based on saved deadlines and dependencies.');
  }
  if (!direct && /my first meeting/.test(text)) {
    const tomorrow = ymd(addDays(tzToday(context.timeZone, context.now), 1));
    const from = prior!.recommendation.intent === 'DRIVING_BRIEFING' ? startOfLocalDay(tomorrow, context.timeZone) : context.now;
    const first = context.events.find((event) => !event.allDay && event.startAt >= from);
    return reply(first ? `Your first upcoming meeting is ${first.title} on ${new Intl.DateTimeFormat('en-US', { timeZone: context.timeZone, weekday: 'long', month: 'short', day: 'numeric' }).format(first.startAt)} at ${formatTime(first.startAt, context.timeZone)}.` : 'No upcoming timed meetings are saved in the next seven days.');
  }
  if (intent === 'FIX_SCHEDULE') {
    if (await scheduleContextVersion(userId) !== contextVersion) throw new Error('STALE_REPLAN');
    actionId = await storeExecutiveProposal(userId, plan, contextVersion!) ?? undefined;
  }
  const explanation = await explain?.(userId, recommendation);
  if (explanation) recommendation.conversationalSummary = explanation;
  const session = await prisma.voiceSession.create({ data: { userId, status: 'processed', transcripts: { create: { text: transcript, confidence: parsed.confidence } } } });
  const read = await prisma.assistantAction.create({ data: { userId, sessionId: session.id, intent: 'EXECUTIVE_READ', payloadJson: JSON.stringify({ options, actionId: actionId ?? null }), resultJson: JSON.stringify(recommendation), executed: true, createdAt: new Date() } });
  inc('recommendation_generated'); log('info', 'recommendation_generated', { intent, priorities: recommendation.priorities.length, moves: recommendation.proposedScheduleChanges.length });
  if (recommendation.nextAction) { inc('next_action_generated'); log('info', 'next_action_generated', { candidates: recommendation.priorities.length }); }
  if (recommendation.risks.length || recommendation.conflicts.length) { inc('schedule_risk_detected'); log('info', 'schedule_risk_detected', { risks: recommendation.risks.length, conflicts: recommendation.conflicts.length }); }
  observeMs('executive_companion_query', started);
  return { transcript, intent: parsed, spoken: recommendation.spoken, executive: recommendation, contextActionId: read.id,
    visual: { summary: recommendation.summary, appointments: [], tasks: [], overdue: [], next: '', rangeLabel: intent === 'FIX_SCHEDULE' ? 'Review your plan' : intent === 'DRIVING_BRIEFING' ? 'Evening briefing' : 'Your next move', sections: recommendation.sections },
    confirmation: actionId ? { actionId, prompt: 'Review these task changes. Apply only if you agree; fixed appointments stay put.' } : null,
  };
}

/** Event-driven Today suggestion over the same engine. No LLM, push, schedule mutation or second memory store. */
export async function proactiveNextAction(userId: string, now = new Date()) {
  const context = await loadScheduleContext(userId, now);
  const quietStart = context.user.preference?.quietStart ?? '21:00';
  const quietEnd = context.user.preference?.quietEnd ?? '07:00';
  const today = tzToday(context.timeZone, now);
  const boundaries = [...context.events.flatMap((event) => [+event.startAt - (event.allDay ? 0 : context.bufferMinutes * 60000), +event.endAt + (event.allDay ? 0 : context.bufferMinutes * 60000)]),
    ...context.tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status)).flatMap((task) => [task.startAt ? +task.startAt : 0, task.startAt ? +task.startAt + task.durationMin * 60000 : 0, ...[0, 8, 24, 72].map((hours) => task.dueAt ? +task.dueAt - hours * 3600000 : 0)]),
    ...workWindows(context.timeZone, context.workingDays, context.workStart, context.workEnd, 7, now, 0).flatMap((window) => [window.start, window.end]),
    ...[today, addDays(today, 1)].flatMap((day) => [quietStart, quietEnd, '00:00'].map((clock) => +zonedDateTime(ymd(day), clock, context.timeZone))),
    context.activeFocus?.endsAt ?? 0, context.calendarFreshUntil ?? 0];
  const nextBoundary = boundaries.filter((value) => value > +now + 1000).sort((a, b) => a - b)[0];
  const result = { enabled: context.nextActionEnabled, refreshAt: nextBoundary ? new Date(nextBoundary).toISOString() : null,
    recommendation: null as import('@/lib/executive-contract').ExecutiveRecommendation | null, contextActionId: null as string | null };
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: context.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const quiet = quietStart !== quietEnd && (quietStart < quietEnd ? clock >= quietStart && clock < quietEnd : clock >= quietStart || clock < quietEnd);
  if (!context.nextActionEnabled || context.activeFocus || quiet || context.contextWarnings.length) return result;
  const { recommendation } = buildExecutiveRecommendation(context, 'NEXT_ACTION', { proactive: true });
  const best = recommendation.nextAction?.bestAction;
  if (!best || recommendation.window.availableMinutes < NEXT_ACTION_POLICY.minimumProactiveWindow) return result;
  // Transaction/CAS prevents simultaneous tabs from both claiming a suggestion.
  try {
    return await prisma.$transaction(async (tx) => {
      const key = 'runtime:next_action';
      const previous = await tx.userMemory.findUnique({ where: { userId_key: { userId, key } } });
      let state: { taskId?: string; score?: number; shownAt?: number; contextActionId?: string; dismissed?: boolean } = {};
      try { state = JSON.parse(previous?.value ?? '{}'); } catch { /* Old operational state is replaceable. */ }
      const previousStillActionable = context.tasks.some(task => task.id === state.taskId && ['INBOX', 'PLANNED', 'IN_PROGRESS'].includes(task.status) && !task.dependencyBlocked);
      if (suppressNextAction(state, best, previousStillActionable, +now)) {
        // Keep an already visible, still-valid card fresh; this is not a new notification.
        return state.taskId === best.taskId && state.contextActionId && !state.dismissed ? { ...result, recommendation, contextActionId: state.contextActionId } : result;
      }
      const value = JSON.stringify({ taskId: best.taskId, score: best.score, shownAt: +now });
      if (previous) {
        const claimed = await tx.userMemory.updateMany({ where: { id: previous.id, userId, value: previous.value }, data: { value, updatedAt: now } });
        if (claimed.count !== 1) return result;
      } else await tx.userMemory.create({ data: { userId, key, value, kind: 'runtime', source: 'next-action', updatedAt: now } });
      const action = await tx.assistantAction.create({ data: { userId, intent: 'EXECUTIVE_READ', payloadJson: JSON.stringify({ options: { proactive: true } }), resultJson: JSON.stringify(recommendation), executed: true, createdAt: now } });
      await tx.userMemory.update({ where: { userId_key: { userId, key } }, data: { value: JSON.stringify({ taskId: best.taskId, score: best.score, shownAt: +now, contextActionId: action.id }) } });
      inc('proactive_next_action_generated'); log('info', 'proactive_next_action_generated');
      return { ...result, recommendation, contextActionId: action.id };
    });
  } catch (error) {
    if (['P2002', 'P2034'].includes((error as { code?: string }).code ?? '')) return result;
    throw error;
  }
}

export async function dismissNextAction(userId: string, contextActionId: string) {
  const prior = await lastExecutiveTurn(userId, contextActionId);
  if (!prior?.recommendation.nextAction?.proactive) throw new Error('NOT_FOUND');
  await prisma.$transaction(async (tx) => {
    const claim = await tx.assistantAction.updateMany({ where: { id: prior.id, userId, confirmation: { not: 'DISMISSED' } }, data: { confirmation: 'DISMISSED' } });
    if (!claim.count) return;
    const best = prior.recommendation.priorities[0];
    if (best) await tx.userMemory.upsert({ where: { userId_key: { userId, key: 'runtime:next_action' } }, create: { userId, key: 'runtime:next_action', kind: 'runtime', source: 'next-action', value: JSON.stringify({ taskId: best.taskId, score: best.score, shownAt: Date.now(), dismissed: true }) }, update: { value: JSON.stringify({ taskId: best.taskId, score: best.score, shownAt: Date.now(), dismissed: true }) } });
    inc('proactive_next_action_dismissed'); log('info', 'proactive_next_action_dismissed');
  });
}
