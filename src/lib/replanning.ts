import { addDays, parseYmd, tzToday, ymd, zonedDateTime } from './time';

export type ReplanTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  startAt: Date | null;
  dueAt: Date | null;
  durationMin: number;
  energyLevel?: string;
  dependsOnIds?: string[];
  updatedAt: Date;
};

export type ReplanEvent = { id: string; title: string; startAt: Date; endAt: Date; externalId?: string | null };
export type ReplanMove = {
  taskId: string;
  title: string;
  fromStartAt: string | null;
  toStartAt: string;
  durationMin: number;
  reason: 'unfinished' | 'meeting_conflict' | 'outside_work_hours' | 'urgent_inserted' | 'priority_displacement';
  expectedUpdatedAt: string;
};
export type ReplanRisk = { taskId: string; title: string; reason: 'no_capacity' | 'deadline_at_risk' };

type Interval = { start: number; end: number; kind: 'event' | 'task' };
type Window = { start: number; end: number };

function overlaps(start: number, end: number, interval: Interval) {
  return start < interval.end && end > interval.start;
}

function priorityScore(task: ReplanTask, now: number) {
  const base = task.priority === 'CRITICAL' ? 400 : task.priority === 'HIGH' ? 300 : task.priority === 'NORMAL' ? 200 : 100;
  const overdue = task.dueAt && task.dueAt.getTime() < now ? 180 : 0;
  const active = task.status === 'IN_PROGRESS' ? 500 : 0;
  const dueSoon = task.dueAt ? Math.max(0, 100 - Math.floor((task.dueAt.getTime() - now) / 3_600_000)) : 0;
  return base + overdue + active + dueSoon;
}

function workWindows(timeZone: string, workingDays: string, workStart: string, workEnd: string, horizonDays: number, now: Date) {
  const allowed = new Set(workingDays.split(',').map(Number));
  const today = tzToday(timeZone, now);
  const windows: Window[] = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const day = addDays(today, offset);
    if (!allowed.has(day.getUTCDay())) continue;
    const dayValue = ymd(day);
    const start = zonedDateTime(dayValue, workStart, timeZone).getTime();
    const end = zonedDateTime(dayValue, workEnd, timeZone).getTime();
    if (end > now.getTime()) windows.push({ start: Math.max(start, Math.ceil(now.getTime() / 900_000) * 900_000), end });
  }
  return windows;
}

function containingWindow(start: number, end: number, windows: Window[]) {
  return windows.some((window) => start >= window.start && end <= window.end);
}

function findSlot(durationMs: number, windows: Window[], busy: Interval[], deadline?: number, notBefore?: number, energyLevel = 'MEDIUM') {
  const search = (respectDeadline: boolean) => {
    const choices: number[] = [];
    for (const window of windows) {
      let cursor = Math.max(window.start, notBefore ?? window.start);
      const relevant = busy.filter((item) => item.end > window.start && item.start < window.end).sort((a, b) => a.start - b.start);
      for (const item of relevant) {
        if (cursor + durationMs <= item.start && (!respectDeadline || !deadline || cursor + durationMs <= deadline)) {
          choices.push(cursor);
          const latest = item.start - durationMs;
          if (latest !== cursor && (!respectDeadline || !deadline || latest + durationMs <= deadline)) choices.push(latest);
        }
        cursor = Math.max(cursor, item.end);
      }
      if (cursor + durationMs <= window.end && (!respectDeadline || !deadline || cursor + durationMs <= deadline)) {
        choices.push(cursor);
        const latest = window.end - durationMs;
        if (latest !== cursor && latest >= (notBefore ?? window.start) && (!respectDeadline || !deadline || latest + durationMs <= deadline)) choices.push(latest);
      }
    }
    if (!choices.length) return null;
    const position = (value: number) => {
      const window = windows.find((item) => value >= item.start && value < item.end);
      return window ? (value - window.start) / (window.end - window.start) : 0.5;
    };
    return choices.sort((a, b) => {
      const energyPenalty = (value: number) => energyLevel === 'HIGH' ? position(value) : energyLevel === 'LOW' ? -position(value) : 0;
      return energyPenalty(a) - energyPenalty(b) || a - b;
    })[0];
  };
  return search(true) ?? search(false);
}

export function buildReplan(input: {
  tasks: ReplanTask[];
  events: ReplanEvent[];
  timeZone: string;
  workingDays: string;
  workStart: string;
  workEnd: string;
  horizonDays?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const horizonDays = input.horizonDays ?? 7;
  const windows = workWindows(input.timeZone, input.workingDays, input.workStart, input.workEnd, horizonDays, now);
  const busy: Interval[] = input.events.map((event) => ({ start: event.startAt.getTime(), end: event.endAt.getTime(), kind: 'event' }));
  const candidates = input.tasks
    .filter((task) => !['COMPLETED', 'CANCELLED', 'WAITING'].includes(task.status))
    .sort((a, b) => priorityScore(b, now.getTime()) - priorityScore(a, now.getTime()) || (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER));
  const moves: ReplanMove[] = [];
  const risks: ReplanRisk[] = [];
  let kept = 0;
  const scheduledEnds = new Map<string, number>();
  const openIds = new Set(candidates.map((task) => task.id));

  // Dependencies are always considered before the tasks they unblock.
  candidates.sort((a, b) => Number((a.dependsOnIds ?? []).includes(b.id)) - Number((b.dependsOnIds ?? []).includes(a.id)) || priorityScore(b, now.getTime()) - priorityScore(a, now.getTime()));

  for (const task of candidates) {
    const durationMs = Math.max(15, task.durationMin || 30) * 60_000;
    const original = task.startAt?.getTime() ?? null;
    const originalEnd = original === null ? null : original + durationMs;
    const inPast = original !== null && original < now.getTime();
    const eventConflict = original !== null && originalEnd !== null && busy.some((item) => item.kind === 'event' && overlaps(original, originalEnd, item));
    const outsideHours = original !== null && originalEnd !== null && !containingWindow(original, originalEnd, windows);
    const blocked = original !== null && originalEnd !== null && busy.some((item) => overlaps(original, originalEnd, item));

    const unresolvedExternalDependency = (task.dependsOnIds ?? []).some((id) => !openIds.has(id) && !scheduledEnds.has(id));
    const dependencyReadyAt = (task.dependsOnIds ?? []).reduce((latest, id) => Math.max(latest, scheduledEnds.get(id) ?? now.getTime()), now.getTime());
    const dependencyConflict = original !== null && dependencyReadyAt > original;
    if (unresolvedExternalDependency) {
      risks.push({ taskId: task.id, title: task.title, reason: 'no_capacity' });
      continue;
    }

    if (original !== null && originalEnd !== null && !inPast && !outsideHours && !blocked && !dependencyConflict) {
      busy.push({ start: original, end: originalEnd, kind: 'task' });
      scheduledEnds.set(task.id, originalEnd);
      kept += 1;
      if (task.dueAt && originalEnd > task.dueAt.getTime()) risks.push({ taskId: task.id, title: task.title, reason: 'deadline_at_risk' });
      continue;
    }

    const slot = findSlot(durationMs, windows, busy, task.dueAt?.getTime(), dependencyReadyAt, task.energyLevel ?? 'MEDIUM');
    if (slot === null) {
      risks.push({ taskId: task.id, title: task.title, reason: 'no_capacity' });
      continue;
    }
    busy.push({ start: slot, end: slot + durationMs, kind: 'task' });
    scheduledEnds.set(task.id, slot + durationMs);
    if (task.dueAt && slot + durationMs > task.dueAt.getTime()) risks.push({ taskId: task.id, title: task.title, reason: 'deadline_at_risk' });
    if (original === slot) { kept += 1; continue; }
    const urgent = task.priority === 'CRITICAL' || task.priority === 'HIGH';
    const reason: ReplanMove['reason'] = inPast
      ? 'unfinished'
      : eventConflict
        ? 'meeting_conflict'
        : outsideHours
          ? 'outside_work_hours'
          : original === null && urgent
            ? 'urgent_inserted'
            : 'priority_displacement';
    moves.push({ taskId: task.id, title: task.title, fromStartAt: task.startAt?.toISOString() ?? null, toStartAt: new Date(slot).toISOString(), durationMin: task.durationMin, reason, expectedUpdatedAt: task.updatedAt.toISOString() });
  }

  return { moves, risks, kept, horizonDays, generatedAt: now.toISOString(), rangeStart: ymd(tzToday(input.timeZone, now)), rangeEnd: ymd(addDays(parseYmd(ymd(tzToday(input.timeZone, now))), horizonDays - 1)) };
}
