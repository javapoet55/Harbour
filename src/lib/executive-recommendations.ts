import { durationLabel } from './duration';
import { analyzeSchedule, calendarBusy, freeSlots, minutesIn, scoreTasks, type IntelligenceTask } from './schedule-intelligence';
import { buildReplan, workWindows, retainSafeMoves, type ReplanTask } from './replanning';
import { addDays, endOfLocalDay, formatTime, startOfLocalDay, tzToday, ymd, zonedDateTime } from './time';
import { executiveRecommendationSchema, type ExecutiveIntent, type ExecutiveRecommendation } from './executive-contract';
import { NEXT_ACTION_POLICY, type NextActionWeights } from './next-action-config';

export type ExecutiveTask = IntelligenceTask & ReplanTask & { completedAt?: Date | null; splittable?: boolean; minFocusMin?: number; projectId?: string | null };
export type ExecutiveContext = {
  protectedTaskIds?: string[];
  tasks: ExecutiveTask[];
  events: Array<{ id: string; title: string; startAt: Date; endAt: Date; allDay?: boolean; externalId?: string | null }>;
  now: Date; timeZone: string; workStart: string; workEnd: string; workingDays: string; bufferMinutes: number;
  contextWarnings?: string[];
  activeFocus?: { taskId: string; startedAt: number; endsAt: number } | null;
  switchingThreshold?: number;
};
export type ExecutiveOptions = { minutes?: number; protectedTaskIds?: string[]; period?: 'afternoon' | 'remaining' | 'tomorrow_morning'; excludedTaskIds?: string[]; candidateTaskIds?: string[]; weights?: NextActionWeights; proactive?: boolean };
const OPEN = new Set(['INBOX', 'PLANNED', 'IN_PROGRESS']);
const minute = 60_000;


/** Orchestration of the existing scoring, interval and replanning engines; no LLM arithmetic. */
export function buildExecutiveRecommendation(context: ExecutiveContext, intent: ExecutiveIntent, options: ExecutiveOptions = {}) {
  const { now, timeZone, tasks, events, bufferMinutes } = context;
  const windowIntent = ['FREE_WINDOW', 'NEXT_ACTION', 'COMPARE_TASKS'].includes(intent);
  const activeFocus = context.activeFocus && context.activeFocus.startedAt <= +now && context.activeFocus.endsAt > +now
    && tasks.some((task) => task.id === context.activeFocus!.taskId && task.status === 'IN_PROGRESS' && !task.dependencyBlocked) ? context.activeFocus : null;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const day = tzToday(timeZone, now);
  const dayKey = ymd(day);
  const todayEnd = +endOfLocalDay(dayKey, timeZone);
  const tomorrowKey = ymd(addDays(day, 1));
  const tomorrowEnd = +endOfLocalDay(tomorrowKey, timeZone);
  const working = workWindows(timeZone, context.workingDays, context.workStart, context.workEnd, 7, now, 0);
  const busy = calendarBusy(events, bufferMinutes);
  const intelligence = analyzeSchedule(context);
  const actionable = tasks.filter((task) => OPEN.has(task.status) && !task.dependencyBlocked);
  const scheduled = tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status) && task.startAt)
    .map((task) => ({ id: task.id, start: +task.startAt!, end: +task.startAt! + task.durationMin * minute }));
  const horizonEnd = +endOfLocalDay(ymd(addDays(day, 6)), timeZone);
  const dueWork = tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status) && task.dueAt && +task.dueAt <= horizonEnd);
  const capacity = new Map<string, number>();
  for (const deadline of [...new Set(dueWork.map((task) => +task.dueAt!))]) {
    const demand = dueWork.filter((task) => +task.dueAt! <= deadline);
    const ids = new Set(demand.map((task) => task.id));
    const free = minutesIn(working.flatMap((window) => freeSlots(window.start, Math.min(window.end, deadline), [...busy, ...scheduled.filter((block) => !ids.has(block.id))])));
    const required = demand.reduce((sum, task) => sum + task.durationMin, 0);
    for (const task of demand.filter((task) => +task.dueAt! === deadline)) capacity.set(task.id, free - required + task.durationMin);
  }
  const ranked = scoreTasks(actionable, now, capacity);
  const protectedIds = new Set([...(context.protectedTaskIds ?? []), ...(options.protectedTaskIds ?? [])]);
  for (const task of actionable) if (task.status === 'IN_PROGRESS' && task.startAt && +task.startAt <= +now && +task.startAt + task.durationMin * minute > +now) protectedIds.add(task.id);

  let start = Math.max(+now, +zonedDateTime(dayKey, intent === 'FIX_SCHEDULE' && options.period !== 'remaining' ? '12:00' : context.workStart, timeZone));
  let end = +zonedDateTime(dayKey, context.workEnd, timeZone);
  if (options.period === 'tomorrow_morning') {
    start = +zonedDateTime(tomorrowKey, context.workStart, timeZone);
    end = Math.min(+zonedDateTime(tomorrowKey, '12:00', timeZone), +zonedDateTime(tomorrowKey, context.workEnd, timeZone));
  }
  // Leave time to review/approve; never propose a block that is already past on arrival.
  if (intent === 'FIX_SCHEDULE') start = Math.max(start, +now + 5 * minute);
  if (intent === 'DRIVING_BRIEFING') { start = +now; end = todayEnd; }
  if (windowIntent) {
    // A declared free interval starts now, even outside configured working hours.
    start = +now;
    const workNow = working.find((window) => window.start <= +now && window.end > +now);
    const desiredEnd = intent === 'FREE_WINDOW' ? +now + (options.minutes ?? 480) * minute : workNow?.end ?? +now;
    const blockers = [...busy, ...scheduled.filter((block) => block.id !== activeFocus?.taskId)];
    const occupied = blockers.some((item) => item.start <= start && item.end > start);
    const next = blockers.filter((item) => item.start > start).sort((a, b) => a.start - b.start)[0];
    end = occupied ? start : Math.min(desiredEnd, next?.start ?? desiredEnd);
  }
  end = Math.max(start, end);
  const selectedDay = options.period === 'tomorrow_morning' ? tomorrowEnd : todayEnd;
  const flexible = actionable.filter((task) => !protectedIds.has(task.id) && (
    Boolean(task.dueAt && +task.dueAt <= selectedDay) || Boolean(task.startAt && +task.startAt < end) || (!task.startAt && !task.dueAt)
  ) && (options.period !== 'tomorrow_morning' || (!task.critical && !['CRITICAL', 'HIGH'].includes(task.priority))));
  const flexibleIds = new Set(flexible.map((task) => task.id));
  const fixedTaskBlocks = scheduled.filter((block) => !flexibleIds.has(block.id));
  const fixed = [...events.filter((event) => +event.startAt < end && +event.endAt > start).map((event) => ({ ...event, allDay: Boolean(event.allDay) })),
    ...tasks.filter((task) => protectedIds.has(task.id) && task.startAt).map((task) => ({ id: task.id, title: task.title, startAt: task.startAt!, endAt: new Date(+task.startAt! + task.durationMin * minute), allDay: false }))];
  const periodSlots = working.flatMap((window) => freeSlots(Math.max(start, window.start), Math.min(end, window.end), [...busy, ...fixedTaskBlocks]));
  const available = windowIntent ? Math.max(0, Math.floor((end - start) / minute)) : minutesIn(periodSlots);
  const plan = intent === 'FIX_SCHEDULE' ? buildReplan({ ...context,
    tasks: flexible,
    // Other task blocks are fixed constraints, not external calendar events to edit.
    events: [...events.map((event) => ({ ...event, startAt: new Date(+event.startAt - (event.allDay ? 0 : bufferMinutes * minute)), endAt: new Date(+event.endAt + (event.allDay ? 0 : bufferMinutes * minute)) })),
      ...fixedTaskBlocks.map((block) => ({ id: block.id, title: 'Reserved task', startAt: new Date(block.start), endAt: new Date(block.end), allDay: false }))],
    horizonDays: options.period === 'tomorrow_morning' ? 2 : 1, windowStart: new Date(start), windowEnd: new Date(end),
    priorityScores: Object.fromEntries(ranked.map((task) => [task.taskId, task.score])), strictDeadlines: true, bufferMinutes: 0, deferCollisionValidation: true,
  }) : { generatedAt: now.toISOString(), moves: [], risks: [] } as { generatedAt: string; moves: import('./replanning').ReplanMove[]; risks: import('./replanning').ReplanRisk[] };
  if (intent === 'FIX_SCHEDULE' && options.period !== 'tomorrow_morning') {
    // If lower-priority work cannot fit today, propose a later *working* slot.
    // Use the same replan engine, retaining today's proposed blocks as fixed constraints.
    const deferred = flexible.filter((task) => plan.risks.some((risk) => risk.taskId === task.id) && !task.critical && !['HIGH', 'CRITICAL'].includes(task.priority) && (!task.dueAt || +task.dueAt > todayEnd));
    if (deferred.length) {
      const deferredIds = new Set(deferred.map((task) => task.id));
      const later = buildReplan({ ...context, tasks: deferred, bufferMinutes: 0, strictDeadlines: true,
        events: [...events.map((event) => ({ ...event, startAt: new Date(+event.startAt - (event.allDay ? 0 : bufferMinutes * minute)), endAt: new Date(+event.endAt + (event.allDay ? 0 : bufferMinutes * minute)) })),
          ...scheduled.filter((block) => !deferredIds.has(block.id) && !plan.moves.some((move) => move.taskId === block.id)).map((block) => ({ id: block.id, title: 'Reserved task', startAt: new Date(block.start), endAt: new Date(block.end) })),
          ...plan.moves.map((move) => ({ id: move.taskId, title: move.title, startAt: new Date(move.toStartAt), endAt: new Date(+new Date(move.toStartAt) + move.durationMin * minute) }))],
        windowStart: startOfLocalDay(tomorrowKey, timeZone), priorityScores: Object.fromEntries(ranked.map((item) => [item.taskId, item.score])),
      });
      plan.moves.push(...later.moves);
      const placed = new Set(later.moves.map((move) => move.taskId));
      plan.risks = plan.risks.filter((risk) => !placed.has(risk.taskId));
    }
  }
  if (intent === 'FIX_SCHEDULE') retainSafeMoves(tasks, plan.moves, plan.risks);
  const blocked = tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status) && (task.dependencyBlocked || task.status === 'WAITING') && ((task.dueAt && +task.dueAt <= selectedDay) || (task.startAt && +task.startAt < end)));
  const required = [...flexible, ...blocked].reduce((sum, task) => sum + task.durationMin, 0);
  const candidates = ranked.map((priority) => {
    const task = taskById.get(priority.taskId)!;
    const taskCapacity = capacity.get(task.id);
    const slackMinutes = task.dueAt && taskCapacity !== undefined ? taskCapacity - task.durationMin : null;
    const budget = Math.max(0, Math.min(available, task.dueAt && task.dueAt > now ? Math.floor((+task.dueAt - start) / minute) : available));
    const focusMinutes = activeFocus?.taskId === task.id && windowIntent
      ? Math.min(budget, Math.ceil((activeFocus.endsAt - +now) / minute), task.durationMin)
      : task.durationMin <= budget ? task.durationMin : task.splittable && budget >= (task.minFocusMin ?? 15) ? budget : 0;
    const partial = focusMinutes > 0 && focusMinutes < task.durationMin;
    // A window-fit multiplier can outweigh priority: unsplittable work that cannot fit is excluded.
    const fit = focusMinutes === 0 ? 0 : partial ? .7 + .3 * focusMinutes / task.durationMin : .8 + .2 * focusMinutes / Math.max(1, available);
    const weights = options.weights ?? NEXT_ACTION_POLICY.weights;
    const factors = { ...priority.factors, windowFit: fit * 100 };
    const totalWeight = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0);
    const baseScore = Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + factors[key as keyof NextActionWeights] * Math.max(0, weight), 0) / (totalWeight || 1));
    const switchingCost = activeFocus && activeFocus.taskId !== task.id
      ? (context.switchingThreshold ?? NEXT_ACTION_POLICY.switchingThreshold) + NEXT_ACTION_POLICY.setupMinutes
        + Math.min(NEXT_ACTION_POLICY.investedPenaltyCap, Math.floor((+now - activeFocus.startedAt) / minute) / 2)
        + (task.projectId && taskById.get(activeFocus.taskId)?.projectId && task.projectId !== taskById.get(activeFocus.taskId)?.projectId ? NEXT_ACTION_POLICY.projectSwitchPenalty : 0) : 0;
    return { ...priority, score: windowIntent ? Math.max(0, baseScore - switchingCost) : priority.score, baseScore, switchingCost, windowFit: Math.round(fit * 100), dependencyImpact: priority.factors.dependencyImpact, durationMin: task.durationMin, focusMinutes,
      partial, slackMinutes, dueAt: task.dueAt?.toISOString() ?? null,
      reasons: [...priority.reasons, ...(windowIntent && focusMinutes ? [partial ? `${durationLabel(focusMinutes)} of useful partial progress; ${durationLabel(task.durationMin - focusMinutes)} remain` : `fits this opening of ${durationLabel(available)}`] : []), ...(slackMinutes !== null && slackMinutes < 0 ? [`${durationLabel(Math.abs(slackMinutes))} short before the deadline`] : []), ...(switchingCost ? [`${switchingCost}-point switching penalty protects your current focus`] : activeFocus?.taskId === task.id ? ['continue your active focus without a context switch'] : [])],
    };
  }).filter((priority) => (!windowIntent || priority.focusMinutes > 0) && !options.excludedTaskIds?.includes(priority.taskId) && (!options.candidateTaskIds || options.candidateTaskIds.includes(priority.taskId)))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const priorities = candidates.slice(0, intent === 'COMPARE_TASKS' ? 8 : 3);
  const conflicts = intelligence.conflicts.map(({ id, title, explanation, recommendedAction }) => ({ id, title, explanation, recommendedAction }));
  const risks = ranked.filter((item) => (capacity.get(item.taskId) ?? Infinity) < (actionable.find((task) => task.id === item.taskId)?.durationMin ?? 0))
    .map((item) => ({ title: item.title, explanation: `${item.title} has insufficient working time before its saved deadline.` }));
  const recommendation: ExecutiveRecommendation = {
    intent, summary: '', conversationalSummary: '', spoken: '', generatedAt: now.toISOString(), timeZone,
    priorities, conflicts, risks, reasoning: [], recommendedActions: [], proposedScheduleChanges: [],
    fixedCommitments: fixed.map((event) => ({ id: event.id, title: event.title, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), allDay: event.allDay })),
    requiresApproval: false, confidence: context.contextWarnings?.length ? .5 : .9,
    window: { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), requestedMinutes: options.minutes ?? null, availableMinutes: available, requiredMinutes: required, deficitMinutes: Math.max(0, required - available) },
    assumptions: [...(context.contextWarnings ?? []), `Uses your saved, visible calendars; recently changed external events need synchronization.`, `${bufferMinutes}-minute assumed buffer before and after appointments; actual travel time is not known.`, 'Deadline capacity is calculated through the next seven calendar days; later deadlines have unknown slack.'], sections: [],
  };
  const time = (value: Date | string) => formatTime(new Date(value), timeZone);
  if (intent === 'FIX_SCHEDULE') {
    recommendation.assumptions.push('New blocks start at least five minutes from now so you can review the plan. Refresh if a proposed start time passes.');
    recommendation.risks.push(...blocked.map((task) => ({ title: task.title, explanation: `${task.title} needs ${task.durationMin} minutes but is waiting or dependency-blocked. Resolve this before scheduling it.` })));
    recommendation.summary = `Your ${options.period === 'tomorrow_morning' ? 'tomorrow morning' : options.period === 'remaining' ? 'remaining day' : 'afternoon'} has ${durationLabel(available)} available for ${durationLabel(required)} of flexible work.${required > available ? ` That is a ${durationLabel(required - available)} deficit.` : ''} No changes have been applied.`;
    recommendation.proposedScheduleChanges = plan.moves.map((move) => ({ taskId: move.taskId, title: move.title, before: move.fromStartAt, after: move.toStartAt, durationMin: move.durationMin, reason: move.reason.replaceAll('_', ' ') }));
    recommendation.requiresApproval = plan.moves.length > 0;
    recommendation.risks.push(...plan.risks.map((risk) => ({ title: risk.title, explanation: `${risk.title} cannot fit safely in this window before its deadline. Leave it unchanged and review a later slot or deadline with its owner.` })));
    recommendation.recommendedActions = plan.moves.length ? [{ type: 'REVIEW_PLAN', label: 'Review proposed changes' }] : [];
    recommendation.sections = [{ title: 'Capacity', items: [`${durationLabel(required)} required · ${durationLabel(available)} available`, `${durationLabel(recommendation.window.deficitMinutes)} of unmet workload`] },
      { title: 'Protected commitments', items: fixed.length ? fixed.map((event) => `${event.title} — ${event.allDay ? 'all day' : time(event.startAt)} unchanged`) : ['No fixed calendar appointments in this period.'] },
      { title: 'Cannot fit', items: recommendation.risks.length ? recommendation.risks.map((risk) => risk.explanation) : ['The proposed flexible work fits.'] }];
  } else if (intent === 'DRIVING_BRIEFING') {
    const done = tasks.filter((task) => task.status === 'COMPLETED' && task.completedAt && +task.completedAt >= +startOfLocalDay(dayKey, timeZone) && +task.completedAt <= +now && (task.critical || ['CRITICAL', 'HIGH'].includes(task.priority)));
    const urgent = tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status) && (task.critical || task.priority === 'CRITICAL') && (!task.dueAt || +task.dueAt <= tomorrowEnd));
    const remaining = events.filter((event) => +event.endAt > +now && +event.startAt <= todayEnd).sort((a, b) => +a.startAt - +b.startAt);
    const first = events.filter((event) => +event.startAt >= +startOfLocalDay(tomorrowKey, timeZone) && +event.startAt <= tomorrowEnd).sort((a, b) => +a.startAt - +b.startAt)[0];
    const short = (title: string) => title.length > 90 ? `${title.slice(0, 87)}…` : title;
    const facts = [`You completed ${done.length} important ${done.length === 1 ? 'task' : 'tasks'} today.`,
      urgent.length ? `${short(urgent[0].title)} still needs attention${urgent.length > 1 ? `, along with ${urgent.length - 1} other critical tasks` : ''}.` : 'No unfinished critical work is flagged.',
      remaining[0] ? `Your next remaining commitment is ${short(remaining[0].title)}${remaining[0].allDay ? ', all day' : ` at ${time(remaining[0].startAt)}`}.` : 'No calendar commitments remain today.',
      first ? `Tomorrow’s first commitment is ${short(first.title)}${first.allDay ? ', all day' : ` at ${time(first.startAt)}`}.` : 'Tomorrow has no saved calendar appointments.',
      conflicts.length ? `${conflicts.length} schedule issues need review. ${short(conflicts[0].title)}.` : 'No schedule conflicts were detected.',
      risks.length ? `${short(risks[0].title)} has a deadline risk. Review it when you are safely parked.` : 'No additional deadline shortfall was detected.',
      'Keep your attention on driving. No schedule changes have been made.'];
    recommendation.summary = 'Your evening snapshot';
    recommendation.spoken = facts.join(' ');
    recommendation.priorities = [];
    recommendation.sections = [{ title: 'On your way home', items: facts }, { title: 'Completed important work', items: done.length ? done.slice(0, 3).map((task) => task.title) : ['No important completions recorded today.'] }];
  } else {
    recommendation.summary = windowIntent
      ? `You have ${durationLabel(available)} available${options.minutes && available < options.minutes ? ` out of the ${durationLabel(options.minutes)} requested, after saved commitments and buffers` : ''}. ${priorities[0] ? `Start with ${priorities[0].title}.` : 'No actionable task fits safely in this opening.'}`
      : `You have ${actionable.length} actionable open tasks. ${priorities.length ? `${priorities.length} deserve your attention first.` : 'Nothing needs a focus recommendation right now.'}`;
    recommendation.sections = [{ title: windowIntent ? 'Best next action & alternatives' : 'Your focus priorities', items: priorities.length ? priorities.map((item, index) => `${index + 1}. ${item.title} — ${item.reasons.join('; ')}`) : [windowIntent && !available ? 'There is no uninterrupted working time available right now. Review your commitments or tell me another time window.' : 'No matching actionable work fits. Check blocked tasks or choose another window.'] },
      { title: 'Schedule & risks', items: [...conflicts.slice(0, 2).map((item) => item.explanation), ...risks.slice(0, 2).map((item) => item.explanation)].slice(0, 3) }].filter((section) => section.items.length);
    if (windowIntent && priorities[0]?.focusMinutes && !context.contextWarnings?.length) recommendation.recommendedActions = [{ type: 'START_FOCUS', taskId: priorities[0].taskId, durationMin: priorities[0].focusMinutes, label: `Start ${priorities[0].focusMinutes}-minute focus session` }];
  }
  if (windowIntent) {
    const outsideWorkingHours = !working.some(window => window.start <= +now && window.end > +now);
    const remainingWorkingMinutesToday = minutesIn(working.flatMap(window => freeSlots(Math.max(+now, window.start), Math.min(todayEnd, window.end), [...busy, ...scheduled])).filter(slot => slot.end > slot.start));
    recommendation.nextAction = { outsideWorkingHours: intent !== 'FREE_WINDOW' && outsideWorkingHours, remainingWorkingMinutesToday, bestAction: priorities[0] ?? null, alternatives: priorities.slice(1), availableWindowMinutes: available,
      suggestedFocusDuration: priorities[0]?.focusMinutes ?? 0, proactive: options.proactive ?? false,
      continuingFocus: Boolean(activeFocus && priorities[0]?.taskId === activeFocus.taskId), confidence: recommendation.confidence };
    recommendation.assumptions.push('Task durations are saved or consented personalized estimates, not verified remaining work. Unknown location, device and meeting-preparation links are not inferred.', `Switching policy uses a ${context.switchingThreshold ?? NEXT_ACTION_POLICY.switchingThreshold}-point improvement threshold plus setup and active-focus investment; it never switches tasks automatically.`);
    if (intent !== 'FREE_WINDOW' && !available && !working.some((window) => window.start <= +now && window.end > +now)) recommendation.summary = `You are outside your saved working hours (${context.workStart}–${context.workEnd}, ${timeZone}). This does not mean your day is full: ${durationLabel(remainingWorkingMinutesToday)} of unreserved working time remaining today. Enter the time you have available to get a recommendation now; appointments and buffers still apply.`;
  }
  recommendation.reasoning = priorities.map((item) => `${item.title}: ${item.reasons.join('; ')}`);
  if (context.contextWarnings?.length) {
    recommendation.sections.unshift({ title: 'Calendar freshness', items: context.contextWarnings });
    if (recommendation.spoken) recommendation.spoken = `${context.contextWarnings.join(' ')} ${recommendation.spoken}`;
  }
  recommendation.conversationalSummary = recommendation.summary;
  recommendation.spoken ||= [recommendation.summary, ...recommendation.sections.slice(0, 2).flatMap((section) => section.items.slice(0, 3))].join(' ').slice(0, 3900);
  return { recommendation: executiveRecommendationSchema.parse(recommendation), plan };
}
