import { addDays, parseYmd, tzToday, ymd, zonedDateTime } from './time';
import { freeSlots } from './schedule-intelligence';

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

export type ReplanEvent = { id: string; title: string; startAt: Date; endAt: Date; allDay?: boolean; externalId?: string | null };
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

export function workWindows(timeZone: string, workingDays: string, workStart: string, workEnd: string, horizonDays: number, now: Date, alignmentMinutes = 15) {
  const allowed = new Set(workingDays.split(',').map(Number));
  const today = tzToday(timeZone, now);
  const windows: Window[] = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const day = addDays(today, offset);
    if (!allowed.has(day.getUTCDay())) continue;
    const dayValue = ymd(day);
    const start = zonedDateTime(dayValue, workStart, timeZone).getTime();
    const end = zonedDateTime(dayValue, workEnd, timeZone).getTime();
    const current = alignmentMinutes > 0 ? Math.ceil(now.getTime() / (alignmentMinutes * 60000)) * alignmentMinutes * 60000 : now.getTime();
    if (end > now.getTime()) windows.push({ start: Math.max(start, current), end });
  }
  return windows;
}

function containingWindow(start: number, end: number, windows: Window[]) {
  return windows.some((window) => start >= window.start && end <= window.end);
}

function findSlot(durationMs: number, windows: Window[], busy: Interval[], deadline?: number, notBefore?: number, energyLevel = 'MEDIUM', strictDeadline = false) {
  const search = (respectDeadline: boolean) => {
    const choices: number[] = [];
    for (const window of windows) {
      const end = respectDeadline && deadline ? Math.min(window.end, deadline) : window.end;
      for (const slot of freeSlots(Math.max(window.start, notBefore ?? window.start), end, busy)) {
        if (slot.end - slot.start >= durationMs) {
          choices.push(slot.start);
          if (slot.end - durationMs !== slot.start) choices.push(slot.end - durationMs);
        }
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
  return search(true) ?? (strictDeadline ? null : search(false));
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
  windowStart?: Date;
  windowEnd?: Date;
  protectedTaskIds?: string[];
  priorityScores?: Record<string, number>;
  bufferMinutes?: number;
  strictDeadlines?: boolean;
  deferCollisionValidation?: boolean;
}) {
  const now = input.now ?? new Date();
  const horizonDays = input.horizonDays ?? 7;
  const windows = workWindows(input.timeZone, input.workingDays, input.workStart, input.workEnd, horizonDays, now)
    .map((window) => ({ start: Math.max(window.start, input.windowStart ? +input.windowStart : window.start), end: Math.min(window.end, input.windowEnd ? +input.windowEnd : window.end) })).filter((window) => window.end > window.start);
  const buffer = Math.max(0, input.bufferMinutes ?? 0) * 60_000;
  const busy: Interval[] = input.events.map((event) => ({ start: +event.startAt - (event.allDay ? 0 : buffer), end: +event.endAt + (event.allDay ? 0 : buffer), kind: 'event' }));
  const protectedIds = new Set(input.protectedTaskIds ?? []);
  for (const task of input.tasks) if (protectedIds.has(task.id) && task.startAt) busy.push({ start: +task.startAt, end: +task.startAt + task.durationMin * 60_000, kind: 'task' });
  const score = (task: ReplanTask) => input.priorityScores?.[task.id] ?? priorityScore(task, +now);
  const candidates = input.tasks
    .filter((task) => !['COMPLETED', 'CANCELLED', 'WAITING'].includes(task.status) && !protectedIds.has(task.id))
    .sort((a, b) => score(b) - score(a) || (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER));
  const moves: ReplanMove[] = [];
  const risks: ReplanRisk[] = [];
  let kept = input.tasks.filter((task) => protectedIds.has(task.id)).length;
  const scheduledEnds = new Map<string, number>();
  const openIds = new Set(candidates.map((task) => task.id));

  // Stable topological traversal handles chains and cycles, not only adjacent pairs.
  const ordered: ReplanTask[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const invalid = new Set<string>();
  const byId = new Map(candidates.map((task) => [task.id, task]));
  const visit = (task: ReplanTask): boolean => {
    if (visiting.has(task.id)) { invalid.add(task.id); return false; }
    if (visited.has(task.id)) return !invalid.has(task.id);
    visiting.add(task.id);
    for (const id of task.dependsOnIds ?? []) {
      const dependency = byId.get(id);
      if (!dependency || !visit(dependency)) invalid.add(task.id);
    }
    visiting.delete(task.id); visited.add(task.id); ordered.push(task);
    return !invalid.has(task.id);
  };
  candidates.forEach(visit);

  for (const task of ordered) {
    const durationMs = Math.max(5, task.durationMin || 30) * 60_000;
    const original = task.startAt?.getTime() ?? null;
    const originalEnd = original === null ? null : original + durationMs;
    const inPast = original !== null && original < now.getTime();
    const eventConflict = original !== null && originalEnd !== null && busy.some((item) => item.kind === 'event' && overlaps(original, originalEnd, item));
    const outsideHours = original !== null && originalEnd !== null && !containingWindow(original, originalEnd, windows);
    const blocked = original !== null && originalEnd !== null && busy.some((item) => overlaps(original, originalEnd, item));

    const unresolvedExternalDependency = invalid.has(task.id) || (task.dependsOnIds ?? []).some((id) => !openIds.has(id) || !scheduledEnds.has(id));
    const dependencyReadyAt = (task.dependsOnIds ?? []).reduce((latest, id) => Math.max(latest, scheduledEnds.get(id) ?? now.getTime()), now.getTime());
    const dependencyConflict = original !== null && dependencyReadyAt > original;
    if (unresolvedExternalDependency) {
      risks.push({ taskId: task.id, title: task.title, reason: 'no_capacity' });
      continue;
    }

    if (original !== null && originalEnd !== null && !inPast && !outsideHours && !blocked && !dependencyConflict && !(input.strictDeadlines && task.dueAt && originalEnd > +task.dueAt)) {
      busy.push({ start: original, end: originalEnd, kind: 'task' });
      scheduledEnds.set(task.id, originalEnd);
      kept += 1;
      if (task.dueAt && originalEnd > task.dueAt.getTime()) risks.push({ taskId: task.id, title: task.title, reason: 'deadline_at_risk' });
      continue;
    }

    const slot = findSlot(durationMs, windows, busy, task.dueAt?.getTime(), dependencyReadyAt, task.energyLevel ?? 'MEDIUM', input.strictDeadlines);
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

  if (!input.deferCollisionValidation) retainSafeMoves(input.tasks, moves, risks);
  return { moves, risks, kept, horizonDays, generatedAt: now.toISOString(), rangeStart: ymd(tzToday(input.timeZone, now)), rangeEnd: ymd(addDays(parseYmd(ymd(tzToday(input.timeZone, now))), horizonDays - 1)) };
}

export function retainSafeMoves(tasks: ReplanTask[], moves: ReplanMove[], risks: ReplanRisk[]) {
  // A task we could not move keeps its real original block. Reject any new collision,
  // repeating because dropping one move restores another original block.
  let changed = true;
  while (changed) {
    changed = false;
    const moved = new Set(moves.map((move) => move.taskId));
    const retained = tasks.filter((task) => !moved.has(task.id) && task.startAt && !['COMPLETED', 'CANCELLED'].includes(task.status));
    for (let i = moves.length - 1; i >= 0; i--) {
      const move = moves[i];
      const start = +new Date(move.toStartAt);
      const dependencyInvalid = (tasks.find((task) => task.id === move.taskId)?.dependsOnIds ?? []).some((id) => {
        const dependency = tasks.find((task) => task.id === id);
        const planned = moves.find((candidate) => candidate.taskId === id);
        return !dependency || !(planned || dependency.startAt) || +(planned ? new Date(planned.toStartAt) : dependency.startAt!) + dependency.durationMin * 60000 > start;
      });
      if (dependencyInvalid || retained.some((task) => task.id !== move.taskId && start < +task.startAt! + task.durationMin * 60000 && start + move.durationMin * 60000 > +task.startAt!)) {
        moves.splice(i, 1); changed = true;
        if (!risks.some((risk) => risk.taskId === move.taskId)) risks.push({ taskId: move.taskId, title: move.title, reason: 'no_capacity' });
      }
    }
  }
}
