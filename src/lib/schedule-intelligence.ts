import { endOfLocalDay, formatTime, startOfLocalDay, tzToday, ymd, zonedDateTime } from './time';

export type IntelligenceEvent = { id: string; title: string; startAt: Date; endAt: Date; allDay?: boolean; externalId?: string | null };
export type IntelligenceTask = {
  id: string; title: string; status: string; priority: string; startAt: Date | null; dueAt: Date | null;
  durationMin: number; critical?: boolean; dependencyBlocked?: boolean; blocksCount?: number; preferenceScore?: number;
  calendarEventId?: string | null; externalEventId?: string | null;
  calendarDurationMin?: number;
  contextScore?: number;
};
export type ScheduleConflict = {
  id: string; type: 'HARD' | 'BUFFER' | 'WORKLOAD' | 'PRIORITY'; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string; explanation: string; affectedItems: Array<{ id: string; title: string; kind: 'event' | 'task' }>;
  recommendedAction: string; confidence: number;
};
export type PriorityScore = { taskId: string; title: string; score: number; reasons: string[]; deadlineRisk: number };

export type TodaySnapshotData = {
  day: string; generatedAt: string; timeZone: string;
  commitments: number; appointments: number; tasks: number; overdue: number; availableMinutes: number;
  workingToday: boolean; workStart: string; workEnd: string; bufferMinutes: number;
  timeline: Array<{ id: string; sourceId: string; kind: 'event' | 'task'; title: string; startAt: string; endAt: string | null; allDay: boolean; deadlineOnly: boolean; past: boolean }>;
  attention: Array<{ id: string; label: string; title: string; explanation: string; recommendedAction: string; kind: 'event' | 'task'; taskId?: string; taskIds?: string[]; requiredMinutes?: number; deadlineAt?: string }>;
  recommendation: { title: string; explanation: string; additionalAdvice?: string; kind: 'event' | 'task' | 'settings'; taskId?: string; startAt?: string; endAt?: string };
  topPriority: PriorityScore | null;
};

const OPEN = new Set(['INBOX', 'PLANNED', 'IN_PROGRESS']);
const isOpen = (task: IntelligenceTask) => OPEN.has(task.status) || task.status === 'WAITING';
const ms = (minutes: number) => minutes * 60_000;
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function priorityImportance(task: IntelligenceTask) {
  if (task.critical || task.priority === 'CRITICAL') return 100;
  if (task.priority === 'HIGH') return 78;
  if (task.priority === 'NORMAL') return 48;
  return 22;
}

function urgency(task: IntelligenceTask, now: Date) {
  if (!task.dueAt) return 16;
  const hours = (task.dueAt.getTime() - now.getTime()) / 3_600_000;
  if (hours < 0) return 100;
  if (hours <= 8) return 96;
  if (hours <= 24) return 86;
  if (hours <= 72) return 66;
  return 30;
}

/** Deterministic, explainable score for actionable work. */
export function scoreTasks(tasks: IntelligenceTask[], now = new Date(), capacityByTask = new Map<string, number>()) {
  return tasks.filter((task) => OPEN.has(task.status) && !task.dependencyBlocked).map((task) => {
    const dueUrgency = urgency(task, now);
    const importance = priorityImportance(task);
    const overdue = task.dueAt && task.dueAt < now ? 100 : 0;
    const dependencyImpact = task.dependencyBlocked ? 15 : Math.min(100, 45 + (task.blocksCount ?? 0) * 18);
    const context = clamp(task.contextScore ?? (task.status === 'IN_PROGRESS' ? 85 : 50));
    const preference = clamp(task.preferenceScore ?? 50);
    const capacity = capacityByTask.get(task.id);
    const deadlineRisk = task.dueAt && capacity !== undefined && capacity < task.durationMin ? 100 : Math.max(overdue, dueUrgency);
    const score = clamp(dueUrgency * .30 + importance * .25 + deadlineRisk * .20 + dependencyImpact * .10 + preference * .10 + context * .05);
    const reasons = [
      overdue ? 'overdue' : dueUrgency >= 86 ? 'deadline soon' : '',
      importance >= 78 ? 'high importance' : '',
      task.blocksCount ? `blocks ${task.blocksCount} follow-on task${task.blocksCount === 1 ? '' : 's'}` : '',
      task.dependencyBlocked ? 'dependency blocked' : '',
      task.dueAt && capacity !== undefined && capacity < task.durationMin ? 'not enough time before the deadline' : '',
    ].filter(Boolean);
    return { taskId: task.id, title: task.title, score, reasons: reasons.length ? reasons : ['scheduled work'], deadlineRisk,
      factors: { importance, urgency: dueUrgency, deadlineRisk, dependencyImpact, context: (context + preference) / 2 } };
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export type Interval = { start: number; end: number };

/** Union busy intervals before subtracting, so overlaps never consume time twice. */
export function freeSlots(start: number, end: number, busy: Interval[]) {
  const slots: Interval[] = [];
  if (end <= start) return slots;
  let cursor = start;
  for (const interval of busy.filter((item) => item.end > start && item.start < end).sort((a, b) => a.start - b.start)) {
    if (interval.start > cursor) slots.push({ start: cursor, end: Math.min(end, interval.start) });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < end) slots.push({ start: cursor, end });
  return slots;
}

export const minutesIn = (slots: Interval[]) => Math.floor(slots.reduce((sum, slot) => sum + slot.end - slot.start, 0) / 60_000);

export function withoutTaskMirrors<T extends IntelligenceEvent>(events: T[], tasks: IntelligenceTask[]) {
  const ids = new Map<string, number>();
  for (const event of events) if (event.externalId) ids.set(event.externalId, (ids.get(event.externalId) ?? 0) + 1);
  return events.filter((event) => event.endAt > event.startAt && !tasks.some((task) => {
    const linked = task.calendarEventId ? task.calendarEventId === event.id : Boolean(event.externalId && ids.get(event.externalId) === 1 && task.externalEventId === event.externalId);
    if (!linked) return false;
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return true;
    return Boolean(task.startAt && +task.startAt === +event.startAt && +event.endAt === +task.startAt + (task.calendarDurationMin ?? task.durationMin) * 60000);
  }));
}

/** Disclosed transition allowance, not a route/travel-time estimate. */
export function calendarBusy(events: IntelligenceEvent[], bufferMinutes = 15): Interval[] {
  return events.map((event) => ({ start: +event.startAt - (event.allDay ? 0 : ms(bufferMinutes)), end: +event.endAt + (event.allDay ? 0 : ms(bufferMinutes)) }));
}

export function analyzeSchedule(input: {
  events: IntelligenceEvent[]; tasks: IntelligenceTask[]; timeZone: string; workStart: string; workEnd: string;
  bufferMinutes?: number; workingDays?: string; now?: Date;
}) {
  const now = input.now ?? new Date();
  const bufferMinutes = Math.max(0, Math.min(120, input.bufferMinutes ?? 15));
  const conflicts: ScheduleConflict[] = [];
  const today = ymd(tzToday(input.timeZone, now));
  const midnight = startOfLocalDay(today, input.timeZone).getTime();
  const dayEnd = endOfLocalDay(today, input.timeZone).getTime();
  const workingToday = (input.workingDays ?? '1,2,3,4,5').split(',').map(Number).includes(tzToday(input.timeZone, now).getUTCDay());
  const dayStart = Math.max(now.getTime(), zonedDateTime(today, input.workStart, input.timeZone).getTime());
  const workEnd = zonedDateTime(today, input.workEnd, input.timeZone).getTime();
  const time = (value: Date | number) => formatTime(new Date(value), input.timeZone);
  const duration = (task: IntelligenceTask) => Math.max(1, task.durationMin || 30);
  // A synced task is one commitment, even if it also has a calendar representation.
  // Include completed tasks in the input to suppress their remaining calendar mirrors too.
  const events = withoutTaskMirrors(input.events, input.tasks);
  const tasks = input.tasks.filter(isOpen);
  const taskBlocks = tasks.filter((task) => task.startAt).map((task) => ({ task, start: task.startAt!.getTime(), end: task.startAt!.getTime() + ms(duration(task)) }));
  const timedEvents = events.filter((event) => !event.allDay && event.endAt > now).sort((a, b) => +a.startAt - +b.startAt);
  // Check every active interval, including events nested inside a longer meeting.
  for (let i = 0; i < timedEvents.length; i++) {
    const first = timedEvents[i];
    for (let j = i + 1; j < timedEvents.length; j++) {
      const second = timedEvents[j];
      if (+second.startAt >= +first.endAt + ms(2 * bufferMinutes)) break;
      const affectedItems = [first, second].map((event) => ({ id: event.id, title: event.title, kind: 'event' as const }));
      if (second.startAt < first.endAt) {
        conflicts.push({ id: `hard:${first.id}:${second.id}`, type: 'HARD', severity: 'CRITICAL', title: 'Calendar overlap', explanation: `${first.title} (${time(first.startAt)}–${time(first.endAt)}) overlaps ${second.title} (${time(second.startAt)}–${time(second.endAt)}).`, affectedItems, recommendedAction: `Review ${second.title} in your calendar and decide which appointment to move.`, confidence: 1 });
      } else {
        const gap = Math.floor((+second.startAt - +first.endAt) / 60_000);
        conflicts.push({ id: `buffer:${first.id}:${second.id}`, type: 'BUFFER', severity: 'HIGH', title: 'A tight transition', explanation: `Only ${gap} minutes separate ${first.title} and ${second.title}. Your assumed ${bufferMinutes}-minute buffers before and after appointments need ${2 * bufferMinutes} minutes.`, affectedItems, recommendedAction: `Review the transition allowance or the next appointment’s time.`, confidence: .8 });
      }
    }
  }
  const eventBusy = calendarBusy(events, bufferMinutes);
  const slotsUntil = (end: number, busy: Interval[]) => workingToday ? freeSlots(dayStart, Math.min(workEnd, end), busy) : [];
  const available = minutesIn(slotsUntil(dayEnd, [...eventBusy, ...taskBlocks]));
  const capacityByTask = new Map(tasks.filter((task) => task.dueAt && +task.dueAt <= dayEnd).map((task) => [task.id, minutesIn(slotsUntil(+task.dueAt!, [...eventBusy, ...taskBlocks.filter((block) => block.task.id !== task.id)]))]));
  const priorities = scoreTasks(tasks, now, capacityByTask);
  const todayEvents = events.filter((event) => +event.startAt <= dayEnd && +event.endAt > midnight);
  const todayTasks = tasks.filter((task) => Boolean((task.dueAt && +task.dueAt >= midnight && +task.dueAt <= dayEnd) || (task.startAt && +task.startAt <= dayEnd && +task.startAt + ms(duration(task)) > midnight)));
  const overdue = tasks.filter((task) => task.dueAt && task.dueAt < now);
  const todayDue = tasks.filter((task) => task.dueAt && task.dueAt >= now && +task.dueAt <= dayEnd).sort((a, b) => +a.dueAt! - +b.dueAt!);
  const required = todayDue.reduce((sum, task) => sum + duration(task), 0);

  for (const block of taskBlocks.filter((block) => block.end > +now && block.start <= dayEnd)) {
    const collision = todayEvents.find((event) => block.start < +event.endAt && block.end > +event.startAt);
    if (collision) conflicts.push({ id: `hard:task:${block.task.id}:${collision.id}`, type: 'HARD', severity: 'HIGH', title: 'Task and calendar overlap', explanation: `${block.task.title} at ${time(block.start)} overlaps ${collision.title}.`, affectedItems: [{ id: block.task.id, title: block.task.title, kind: 'task' }, { id: collision.id, title: collision.title, kind: 'event' }], recommendedAction: `Choose a free slot for ${block.task.title} around the appointment.`, confidence: 1 });
    else {
      const transition = todayEvents.find((event) => !event.allDay && block.start < +event.endAt + ms(bufferMinutes) && block.end > +event.startAt - ms(bufferMinutes));
      if (transition) conflicts.push({ id: `buffer:task:${block.task.id}:${transition.id}`, type: 'BUFFER', severity: 'HIGH', title: 'Task needs transition time', explanation: `${block.task.title} uses the assumed ${bufferMinutes}-minute buffer around ${transition.title}.`, affectedItems: [{ id: block.task.id, title: block.task.title, kind: 'task' }, { id: transition.id, title: transition.title, kind: 'event' }], recommendedAction: 'Review the transition allowance or move the task.', confidence: .8 });
    }
  }

  // Test each deadline prefix: two tasks cannot both consume the same free hour.
  let previousDeficit = 0;
  for (const deadline of [...new Set(todayDue.map((task) => +task.dueAt!))]) {
    const demand = todayDue.filter((task) => +task.dueAt! <= deadline);
    const demandIds = new Set(demand.map((task) => task.id));
    const otherBlocks = taskBlocks.filter((block) => !demandIds.has(block.task.id));
    const capacity = minutesIn(slotsUntil(deadline, [...eventBusy, ...otherBlocks]));
    const needed = demand.reduce((sum, task) => sum + duration(task), 0);
    const deficit = needed - capacity;
    if (deficit > Math.max(0, previousDeficit)) {
      conflicts.push({ id: `workload:${deadline}`, type: 'WORKLOAD', severity: deficit >= 60 ? 'CRITICAL' : 'HIGH', title: demand.length === 1 ? `Find time for your ${demand[0].title.toLowerCase()}` : `Let’s make room for these ${demand.length} tasks`, explanation: `${demand.length === 1 ? demand[0].title : 'These tasks'} ${demand.length === 1 ? 'needs' : 'need'} ${needed} minutes by ${time(deadline)}, but only ${capacity} minutes are available before then${workingToday ? '' : ' in your working hours (today is a non-working day)'}.`, affectedItems: demand.map((task) => ({ id: task.id, title: task.title, kind: 'task' })), recommendedAction: `Free at least ${deficit} more minutes before ${time(deadline)}, or agree on a later deadline.`, confidence: .95 });
      const flexible = otherBlocks.filter((block) => block.end > dayStart && block.start < Math.min(deadline, workEnd) && priorityImportance(block.task) < Math.max(...demand.map(priorityImportance)) && (!block.task.dueAt || +block.task.dueAt > deadline));
      const withoutFlexible = minutesIn(slotsUntil(deadline, [...eventBusy, ...otherBlocks.filter((block) => !flexible.includes(block))]));
      if (withoutFlexible > capacity) conflicts.push({ id: `priority:${deadline}`, type: 'PRIORITY', severity: 'HIGH', title: 'Flexible work could make room', explanation: `Moving ${flexible.map((block) => block.task.title).join(', ')} would release ${withoutFlexible - capacity} minutes before ${time(deadline)}.`, affectedItems: flexible.map((block) => ({ id: block.task.id, title: block.task.title, kind: 'task' })), recommendedAction: 'Review these lower-priority tasks and move the ones that can wait.', confidence: .9 });
    }
    previousDeficit = deficit;
  }

  const todayIds = new Set([...todayEvents.map((event) => event.id), ...todayTasks.map((task) => task.id)]);
  const attention: TodaySnapshotData['attention'] = conflicts.filter((conflict) => conflict.affectedItems.some((item) => todayIds.has(item.id))).map((conflict) => {
    const task = conflict.affectedItems.find((item) => item.kind === 'task');
    const taskItems = conflict.affectedItems.filter((item) => item.kind === 'task');
    const workloadDeadline = conflict.type === 'WORKLOAD' ? Number(conflict.id.split(':')[1]) : undefined;
    return { id: conflict.id, label: conflict.type === 'WORKLOAD' ? 'Schedule check' : conflict.type === 'PRIORITY' ? 'Make room' : 'Conflict', title: conflict.title, explanation: conflict.explanation, recommendedAction: conflict.recommendedAction, kind: task ? 'task' : 'event', taskId: task?.id, taskIds: taskItems.map((item) => item.id), requiredMinutes: conflict.type === 'WORKLOAD' ? taskItems.reduce((total, item) => total + (tasks.find((task) => task.id === item.id)?.durationMin ?? 0), 0) : undefined, deadlineAt: workloadDeadline ? new Date(workloadDeadline).toISOString() : undefined };
  });
  if (overdue.length) attention.push({ id: 'overdue', label: 'Overdue', title: `${overdue.length} unfinished ${overdue.length === 1 ? 'deadline' : 'deadlines'}`, explanation: overdue.slice(0, 3).map((task) => task.title).join(' · ') + (overdue.length > 3 ? ` · and ${overdue.length - 3} more` : ''), recommendedAction: 'Review overdue work and choose what to finish or reschedule.', kind: 'task', taskId: overdue[0].id });
  for (const task of todayTasks.filter((task) => task.dependencyBlocked || task.status === 'WAITING')) {
    attention.push({ id: `dependency:${task.id}`, label: 'Blocked', title: task.title, explanation: 'This task is waiting or has an unfinished dependency.', recommendedAction: 'Resolve the dependency before reserving time for this task.', kind: 'task', taskId: task.id });
  }

  const top = priorities.find((ranked) => todayTasks.some((task) => task.id === ranked.taskId) || overdue.some((task) => task.id === ranked.taskId)) ?? priorities[0] ?? null;
  const focus = tasks.find((task) => task.id === top?.taskId);
  let recommendation: TodaySnapshotData['recommendation'] = attention[0]
    ? { title: 'Start here', explanation: attention[0].recommendedAction, kind: attention[0].kind, taskId: attention[0].taskId }
    : { title: 'Room to breathe', explanation: 'No conflicts detected in your saved schedule. Add a task or review your calendar.', kind: 'event' };
  if (focus && workingToday) {
    const deadline = focus.dueAt && focus.dueAt > now ? Math.min(+focus.dueAt, dayEnd) : dayEnd;
    const otherBlocks = taskBlocks.filter((block) => block.task.id !== focus.id);
    const findFocusSlot = (blocks: Interval[]) => slotsUntil(deadline, [...eventBusy, ...blocks])
      .map((window) => ({ ...window, start: Math.ceil(window.start / ms(5)) * ms(5) })).find((window) => window.end - window.start >= ms(duration(focus)));
    const slot = findFocusSlot(otherBlocks);
    if (slot) recommendation = { title: `Protect ${time(slot.start)}–${time(slot.start + ms(duration(focus)))}`, explanation: `Use this ${duration(focus)}-minute opening for ${focus.title}${focus.dueAt && focus.dueAt > now ? `, before its ${time(focus.dueAt)} deadline` : ''}. Review the task to set its time.`, kind: 'task', taskId: focus.id, startAt: new Date(slot.start).toISOString(), endAt: new Date(slot.start + ms(duration(focus))).toISOString() };
    else {
      const flexible = otherBlocks.filter((block) => priorityImportance(block.task) < priorityImportance(focus) && block.task.status !== 'IN_PROGRESS' && (!block.task.dueAt || +block.task.dueAt > deadline));
      const possible = findFocusSlot(otherBlocks.filter((block) => !flexible.includes(block)));
      if (possible) {
        const displaced = flexible.filter((block) => block.start < possible.start + ms(duration(focus)) && block.end > possible.start);
        recommendation = { title: 'Make room for your priority', explanation: `If ${displaced.map((block) => block.task.title).join(' and ')} can move, ${time(possible.start)}–${time(possible.start + ms(duration(focus)))} could be reserved for ${focus.title}. Review the flexible work first.`, kind: 'task', taskId: displaced[0]?.task.id };
      }
    }
  }
  const calendarAdvice = attention.find((item) => item.kind === 'event');
  if (calendarAdvice && recommendation.explanation !== calendarAdvice.recommendedAction) recommendation.additionalAdvice = calendarAdvice.recommendedAction;
  if (!workingToday && !attention.length) recommendation = { title: 'A day outside your working week', explanation: 'Your calendar is still shown. No work capacity is assumed today; you can adjust your working hours in Settings.', kind: 'settings' };
  const timeline: TodaySnapshotData['timeline'] = [
    ...todayEvents.map((event) => ({ id: `event:${event.id}`, sourceId: event.id, kind: 'event' as const, title: event.title, startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), allDay: Boolean(event.allDay), deadlineOnly: false, past: event.endAt <= now })),
    ...todayTasks.map((task) => {
      const at = task.startAt && +task.startAt >= midnight && +task.startAt <= dayEnd ? task.startAt : task.dueAt ?? task.startAt!;
      return { id: `task:${task.id}`, sourceId: task.id, kind: 'task' as const, title: task.title, startAt: at.toISOString(), endAt: task.startAt === at ? new Date(+at + ms(duration(task))).toISOString() : null, allDay: false, deadlineOnly: at !== task.startAt, past: false };
    }),
  ].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startAt.localeCompare(b.startAt));
  const snapshot: TodaySnapshotData = { day: today, generatedAt: now.toISOString(), timeZone: input.timeZone, commitments: todayEvents.length + todayTasks.length, appointments: todayEvents.length, tasks: todayTasks.length, overdue: overdue.length, availableMinutes: available, workingToday, workStart: input.workStart, workEnd: input.workEnd, bufferMinutes, timeline, attention, recommendation, topPriority: top };
  return { conflicts, priorities, availableMinutes: available, requiredMinutes: required, commitmentsToday: todayEvents.length, today: snapshot };
}
