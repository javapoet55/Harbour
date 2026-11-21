import { addDays, dayKey, isDone, parseServerDate, standardContains, startOfDay } from './task-query';

/**
 * Helpers behind the web Tasks screen. Each one is the web port of a piece of the iPhone task module,
 * so the two apps order, label and schedule tasks the same way.
 */

/* ---------- Manual order: ios/Sources/NexdoCore/TaskDisplayOrder.swift ---------- */

/** The saved order for the ids still present, then any new ids in their given order. */
export function sortedIds(ids: string[], saved: string[]): string[] {
  const present = new Set(ids);
  const ordered = saved.filter((id) => present.has(id));
  const known = new Set(ordered);
  return [...ordered, ...ids.filter((id) => !known.has(id))];
}

/** `source` takes `target`'s place. `null` for a no-op or an id that is not in the list. */
export function movingId(source: string, target: string, ids: string[]): string[] | null {
  if (source === target) return null;
  const from = ids.indexOf(source);
  const to = ids.indexOf(target);
  if (from < 0 || to < 0) return null;
  const result = [...ids];
  result.splice(from, 1);
  result.splice(to, 0, source);
  return result;
}

/** Every account's saved order in this browser: `[owner: [taskID]]`, the same shape the phone stores. */
export type TaskDisplayOrders = Record<string, string[]>;
export const TASK_DISPLAY_ORDERS_KEY = 'nexdo.taskDisplayOrders';

/** A date group in the account's saved order. */
export function orderedTasks<T extends { id: string }>(tasks: T[], orders: TaskDisplayOrders, ownerId: string | null | undefined): T[] {
  const saved = ownerId ? orders[ownerId] ?? [] : [];
  const byId = new Map<string, T>();
  for (const task of tasks) if (!byId.has(task.id)) byId.set(task.id, task);
  return sortedIds(tasks.map((task) => task.id), saved).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/**
 * Drop `source` on `target` within one date group. Display order only: dates, deadlines and reminders
 * never change and nothing is sent to the server. The group's new order goes to the END of the saved
 * list so other groups keep theirs. Returns the new orders, or `null` when nothing changes.
 */
export function reorderTasks(orders: TaskDisplayOrders, ownerId: string | null | undefined, source: string, target: string, group: { id: string }[]): TaskDisplayOrders | null {
  if (!ownerId) return null;
  const reordered = movingId(source, target, orderedTasks(group, orders, ownerId).map((task) => task.id));
  if (!reordered) return null;
  const visible = new Set(reordered);
  return { ...orders, [ownerId]: [...(orders[ownerId] ?? []).filter((id) => !visible.has(id)), ...reordered] };
}

/** Move one place up (-1) or down (+1) within its date group. */
export function moveTask(orders: TaskDisplayOrders, ownerId: string | null | undefined, id: string, offset: number, group: { id: string }[]): TaskDisplayOrders | null {
  const ids = orderedTasks(group, orders, ownerId).map((task) => task.id);
  const index = ids.indexOf(id);
  if (index < 0 || index + offset < 0 || index + offset >= ids.length) return null;
  return reorderTasks(orders, ownerId, id, ids[index + offset], group);
}

/** Anything unreadable is "no saved order". */
export function parseTaskDisplayOrders(raw: string | null): TaskDisplayOrders {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string')));
  } catch {
    return {};
  }
}

/* ---------- Creation: TaskCreationSpacing.swift and TaskCreationDate (TaskSaveInput.swift) ---------- */

const GAP_MS = 15 * 60_000;

/**
 * A new task's default start moves to the first opening at or after it, leaving 15 minutes on either
 * side of every open, scheduled task.
 */
export function spacedCreationStart(proposed: number, durationMin: number, tasks: { status: string; startAt?: string | null; durationMin: number }[]): number {
  const duration = Math.max(1, durationMin) * 60_000;
  const intervals = tasks
    .flatMap((task) => {
      if (isDone(task) || task.status === 'CANCELLED') return [];
      const start = parseServerDate(task.startAt ?? null);
      return start === null ? [] : [{ start, end: start + Math.max(1, task.durationMin) * 60_000 }];
    })
    .sort((left, right) => left.start - right.start);
  let candidate = proposed;
  for (const { start, end } of intervals) {
    if (candidate < end + GAP_MS && candidate + duration + GAP_MS > start) candidate = end + GAP_MS;
  }
  return candidate;
}

export const TASK_CREATION_DATES = ['Today', 'Tomorrow', 'Select Date'] as const;
export type TaskCreationDate = (typeof TASK_CREATION_DATES)[number];

/**
 * `TaskCreationDate.resolve`: Today is now; Tomorrow and a picked date keep the current clock time in
 * the account's time zone. `customYmd` is the picked `yyyy-mm-dd`.
 */
export function resolveCreationDate(choice: TaskCreationDate, customYmd: string, timeZone: string, now: number = Date.now()): number {
  if (choice === 'Today') return now;
  const sinceMidnight = now - startOfDay(now, timeZone);
  if (choice === 'Tomorrow') return addDays(now, 1, timeZone) + sinceMidnight;
  const [year, month, day] = customYmd.split('-').map(Number);
  if (!year || !month || !day) return now;
  return startOfDay(Date.UTC(year, month - 1, day, 12), timeZone) + sinceMidnight;
}

/** The `yyyy-mm-dd` of an instant in the account's zone, for the date input. */
export function ymdInZone(at: number, timeZone: string): string {
  return dayKey(at, timeZone);
}

/* ---------- Row appearance: TaskRowIcon (TaskCategoryAppearance.swift) and RootView.taskIcon ---------- */

export type TaskRowIcon = 'envelope' | 'wrench' | 'phone' | 'laptop' | 'calendar' | 'document';

const SUFFIXES = ['s', 'es', 'ed', 'ing', 'er', 'ers'];

/** The row icon is read from the title's words, as on the phone. */
export function taskRowIcon(title: string): TaskRowIcon {
  const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const has = (...stems: string[]) => stems.some((stem) => words.some((word) => word === stem || (word.startsWith(stem) && SUFFIXES.includes(word.slice(stem.length)))));
  if (has('email', 'message')) return 'envelope';
  if (has('plumb', 'repair', 'handyman', 'electrician')) return 'wrench';
  if (has('call', 'contact')) return 'phone';
  if (has('laptop', 'computer')) return 'laptop';
  if (has('meeting', 'appointment')) return 'calendar';
  return 'document';
}

/** `NexdoTask.lifeReminderLabel` (Models.swift). */
export function lifeReminderLabel(type: string | null | undefined): string | null {
  switch (type) {
    case 'returnItem': return 'Return';
    case 'bill': return 'Bill';
    case 'expiration': return 'Expires';
    case 'maintenance': return 'Maintenance';
    case 'subscription': return 'Subscription';
    case 'renewal': return 'Renewal';
    case 'general': return 'Reminder';
    default: return null;
  }
}

/* ---------- Labels: RootView.sectionTitle / sectionDate / taskSubtitle ---------- */

function weekdayMonthDay(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(at));
}

/** "EEEE, MMM d" for a section's day. */
export function sectionDate(day: number, timeZone: string): string {
  return weekdayMonthDay(day, timeZone);
}

/** Today, Yesterday, Tomorrow, Unscheduled, or the date. */
export function sectionTitle(day: number, timeZone: string, unscheduled: number, now: number = Date.now()): string {
  if (day === unscheduled) return 'Unscheduled';
  const key = dayKey(day, timeZone);
  if (key === dayKey(now, timeZone)) return 'Today';
  if (key === dayKey(addDays(now, -1, timeZone), timeZone)) return 'Yesterday';
  if (key === dayKey(addDays(now, 1, timeZone), timeZone)) return 'Tomorrow';
  return weekdayMonthDay(day, timeZone);
}

/** "9:00 AM · 30 min", "Unscheduled · 1 hr". Whole hours read as hours. */
export function taskSubtitle(task: { startAt?: string | null; dueAt?: string | null; durationMin: number }, timeZone: string): string {
  const parts: string[] = [];
  const at = parseServerDate(task.startAt ?? task.dueAt);
  parts.push(at === null ? 'Unscheduled' : new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(at)));
  if (task.durationMin > 0) parts.push(task.durationMin % 60 === 0 ? `${task.durationMin / 60} hr` : `${task.durationMin} min`);
  return parts.join(' · ');
}

/* ---------- Folders: ios/Sources/NexdoCore/Projects.swift ---------- */

export type Folder = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  completedTaskCount: number;
  totalTaskCount: number;
};

export const FOLDER_SORTS = ['Recently updated', 'Name', 'Most tasks', 'Highest completion'] as const;
export type FolderSort = (typeof FOLDER_SORTS)[number];

export const FOLDER_PALETTE = ['#8875ff', '#35bce6', '#ed4b9a', '#67be66', '#367de8', '#5b6abf'];
export const FOLDER_COLOR_NAMES: Record<string, string> = { '#8875ff': 'Purple', '#35bce6': 'Cyan', '#ed4b9a': 'Pink', '#67be66': 'Green', '#367de8': 'Blue', '#5b6abf': 'Indigo' };
export const NO_FOLDER_NAME = 'No Named Folder';

export function folderProgress(folder: Pick<Folder, 'completedTaskCount' | 'totalTaskCount'>): number {
  return folder.totalTaskCount > 0 ? Math.min(1, folder.completedTaskCount / folder.totalTaskCount) : 0;
}

/** 1–80 characters once the surrounding spaces are removed. */
export function validFolderName(name: string): boolean {
  const value = name.trim();
  return value.length > 0 && value.length <= 80;
}

function foldName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en-US');
}

/** `ProjectQuery.results`: filter by name, then sort; ties fall back to the id so the order is stable. */
export function folderResults(folders: Folder[], search: string, sort: FolderSort): Folder[] {
  const term = search.trim();
  return folders
    .filter((folder) => !term || standardContains(folder.name, term))
    .sort((a, b) => {
      if (sort === 'Recently updated' && a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1;
      if (sort === 'Name') {
        const left = foldName(a.name);
        const right = foldName(b.name);
        if (left !== right) return left < right ? -1 : 1;
      }
      if (sort === 'Most tasks' && a.totalTaskCount !== b.totalTaskCount) return b.totalTaskCount - a.totalTaskCount;
      if (sort === 'Highest completion' && folderProgress(a) !== folderProgress(b)) return folderProgress(b) - folderProgress(a);
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** `ProjectDetailView.tasks`: one folder's tasks, open first, then by title. `folderId` null is No Named Folder. */
export function folderTasks<T extends { id: string; title: string; status: string; priority: string; projectId?: string | null }>(tasks: T[], folderId: string | null, search: string, status: 'All' | 'Open' | 'Completed', priority: string): T[] {
  const term = search.trim();
  return tasks
    .filter((task) => (task.projectId ?? null) === folderId && task.status !== 'CANCELLED'
      && (!term || standardContains(task.title, term))
      && (status === 'All' || (status === 'Completed' ? isDone(task) : !isDone(task)))
      && (priority === 'All' || task.priority === priority))
    .sort((a, b) => {
      if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
      if (a.title === b.title) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      return a.title.localeCompare(b.title, 'en-US', { numeric: true, sensitivity: 'base' });
    });
}

/* ---------- Web Tasks dashboard: buckets, counts and weekly progress ---------- */

export const TASK_BUCKETS = ['overdue', 'today', 'tomorrow', 'week', 'later', 'unscheduled', 'completed'] as const;
export type TaskBucket = (typeof TASK_BUCKETS)[number];
export const TASK_CHIPS = ['All Tasks', 'Today', 'Tomorrow', 'This Week'] as const;
export type TaskChip = (typeof TASK_CHIPS)[number];
export const TASK_SORTS = ['Due Date', 'Priority', 'Title'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

type DashTask = { id: string; title: string; status: string; priority: string; critical?: boolean; notes?: string | null; startAt?: string | null; dueAt?: string | null; completedAt?: string | null };
const OPEN_STATUSES = new Set(['INBOX', 'PLANNED', 'IN_PROGRESS', 'WAITING']);
const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const priorityOf = (task: Pick<DashTask, 'priority' | 'critical'>) => (task.critical ? 'CRITICAL' : task.priority);
const taskTime = (task: Pick<DashTask, 'startAt' | 'dueAt'>) => parseServerDate(task.startAt ?? task.dueAt);

/**
 * Where a task's own date falls relative to today: before today, today, tomorrow, the rest of the next
 * seven days, later, or no date. Completed tasks keep this as their range so the date chips still apply.
 */
export function dateBucket(task: Pick<DashTask, 'startAt' | 'dueAt'>, timeZone: string, now: number): Exclude<TaskBucket, 'completed'> {
  const at = taskTime(task);
  if (at === null) return 'unscheduled';
  const today = startOfDay(now, timeZone);
  if (at < today) return 'overdue';
  const tomorrow = addDays(now, 1, timeZone);
  if (at < tomorrow) return 'today';
  if (at < addDays(now, 2, timeZone)) return 'tomorrow';
  return at < addDays(now, 7, timeZone) ? 'week' : 'later';
}

const CHIP_RANGES: Record<TaskChip, ReadonlySet<string>> = {
  'All Tasks': new Set(TASK_BUCKETS),
  Today: new Set(['today']),
  Tomorrow: new Set(['tomorrow']),
  'This Week': new Set(['today', 'tomorrow', 'week']),
};

export type TaskFilters = { chip: TaskChip; status: 'Open' | 'Completed' | 'All'; priority: string; highPriority: boolean; search: string; sort: TaskSort };
export const DEFAULT_TASK_FILTERS: TaskFilters = { chip: 'All Tasks', status: 'Open', priority: 'All', highPriority: false, search: '', sort: 'Due Date' };

/**
 * The sections of the Tasks page: open tasks grouped by when they fall, then completed ones. A search
 * looks through every date and status, so it finds finished work too. Empty sections are left out.
 */
export function taskSections<T extends DashTask>(tasks: T[], filters: TaskFilters, timeZone: string, now: number): Array<{ bucket: TaskBucket; tasks: T[] }> {
  const term = filters.search.trim();
  const ranges = term ? CHIP_RANGES['All Tasks'] : CHIP_RANGES[filters.chip];
  const status = term ? 'All' : filters.status;
  const groups = new Map<TaskBucket, T[]>();
  for (const task of tasks) {
    const done = isDone(task);
    if (!done && !OPEN_STATUSES.has(task.status)) continue;
    if (status === 'Open' ? done : status === 'Completed' ? !done : false) continue;
    const level = priorityOf(task);
    if (filters.highPriority && level !== 'HIGH' && level !== 'CRITICAL') continue;
    if (filters.priority !== 'All' && task.priority !== filters.priority) continue;
    if (term && !standardContains(task.title, term) && !(task.notes && standardContains(task.notes, term))) continue;
    const range = dateBucket(task, timeZone, now);
    if (!ranges.has(range)) continue;
    const bucket: TaskBucket = done ? 'completed' : range;
    groups.set(bucket, [...(groups.get(bucket) ?? []), task]);
  }
  const far = Number.MAX_SAFE_INTEGER;
  const byDate = (a: T, b: T) => (taskTime(a) ?? far) - (taskTime(b) ?? far) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const order = (a: T, b: T) => {
    if (filters.sort === 'Priority') return (PRIORITY_ORDER[priorityOf(a)] ?? 2) - (PRIORITY_ORDER[priorityOf(b)] ?? 2) || byDate(a, b);
    if (filters.sort === 'Title') return a.title.localeCompare(b.title, 'en-US', { numeric: true, sensitivity: 'base' }) || byDate(a, b);
    return byDate(a, b);
  };
  const newestDone = (a: T, b: T) => (parseServerDate(b.completedAt ?? null) ?? taskTime(b) ?? 0) - (parseServerDate(a.completedAt ?? null) ?? taskTime(a) ?? 0);
  return TASK_BUCKETS.flatMap((bucket) => {
    const list = groups.get(bucket);
    return list ? [{ bucket, tasks: [...list].sort(bucket === 'completed' && filters.sort === 'Due Date' ? newestDone : order) }] : [];
  });
}

/** The five counts across the top of the page, from every task regardless of the filters. */
export function taskStats(tasks: DashTask[], timeZone: string, now: number) {
  const today = startOfDay(now, timeZone);
  const weekAgo = now - 7 * 86_400_000;
  const open = tasks.filter((task) => OPEN_STATUSES.has(task.status));
  return {
    total: open.length,
    overdue: open.filter((task) => { const at = taskTime(task); return at !== null && at < today; }).length,
    todo: open.filter((task) => task.status === 'INBOX' || task.status === 'PLANNED').length,
    inProgress: open.filter((task) => task.status === 'IN_PROGRESS').length,
    completed: tasks.filter((task) => task.status === 'COMPLETED' && (parseServerDate(task.completedAt ?? null) ?? 0) >= weekAgo).length,
  };
}

/**
 * This week (Monday to Sunday): how many tasks were completed, out of those plus the open tasks dated
 * this week, and the completions on each day.
 */
export function weeklyProgress(tasks: DashTask[], timeZone: string, now: number) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(now));
  const todayIndex = Math.max(0, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday));
  const start = addDays(now, -todayIndex, timeZone);
  const end = addDays(now, 7 - todayIndex, timeZone);
  const days = Array.from({ length: 7 }, () => 0);
  let completed = 0;
  let open = 0;
  for (const task of tasks) {
    if (task.status === 'COMPLETED') {
      const at = parseServerDate(task.completedAt ?? null);
      if (at === null || at < start || at >= end) continue;
      completed += 1;
      for (let index = 6; index >= 0; index--) if (at >= addDays(start, index, timeZone)) { days[index] += 1; break; }
    } else if (OPEN_STATUSES.has(task.status)) {
      const at = taskTime(task);
      if (at !== null && at >= start && at < end) open += 1;
    }
  }
  const total = completed + open;
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0, days, todayIndex, start, end };
}
