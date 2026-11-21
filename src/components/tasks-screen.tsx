'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  BarChart3, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, CircleCheck, Clock3, FileText, Flag, Folder as FolderIcon,
  Hourglass, LayoutGrid, List, ListChecks, ListTodo, MoreHorizontal, PlayCircle, Plus, Search, SlidersHorizontal, Sparkles, SquareKanban, Tag, Timer, X, Zap,
} from 'lucide-react';
import { scheduleFetch } from '@/lib/schedule-fetch';
import type { AgendaTask } from '@/lib/types';
import { addDays, isDone, parseServerDate } from '@/lib/task-query';
import {
  DEFAULT_TASK_FILTERS, lifeReminderLabel, orderedTasks, parseTaskDisplayOrders, reorderTasks, spacedCreationStart, TASK_CHIPS, TASK_DISPLAY_ORDERS_KEY, TASK_SORTS, taskSections, taskStats, weeklyProgress,
  type Folder, type TaskBucket, type TaskDisplayOrders, type TaskFilters, type TaskSort,
} from '@/lib/task-list';
import { TaskDetailSheet } from './today-board';
import { FocusSessionControl } from './focus-session';
import { TaskCreateSheet } from './task-create-sheet';
import { ConfirmDialog, FolderDetail, FolderList } from './task-folders';
import { FocusTimerCard, usePomodoro } from './focus-timer';
import { EventSheet, NoteSheet, ReminderSheet, type Note } from './quick-add-sheets';
import { NotesPanel } from './notes-panel';
import { RemindersPanel, type ReminderItem } from './reminders-panel';
import './tasks-screen.css';
import './tasks-dashboard.css';

type Task = AgendaTask;
type View = 'list' | 'grid' | 'board';
type SortChoice = TaskSort | 'My Order';
const SORT_CHOICES: SortChoice[] = [...TASK_SORTS, 'My Order'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SECTION_TITLES: Record<TaskBucket, string> = { overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', week: 'This Week', later: 'Later', unscheduled: 'Unscheduled', completed: 'Completed' };
const minutesLabel = (minutes: number) => (!Number.isFinite(minutes) || minutes <= 0 ? '' : minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`);

/** The badge on the right of a row: what state the task is in, or how important it is. */
function badgeFor(task: Task): { label: string; tone: string; Icon: typeof Flag } {
  if (isDone(task)) return { label: 'Done', tone: 'done', Icon: Check };
  if (task.status === 'IN_PROGRESS') return { label: 'In progress', tone: 'progress', Icon: PlayCircle };
  if (task.status === 'WAITING') return { label: 'Waiting', tone: 'waiting', Icon: Hourglass };
  if (task.critical || task.priority === 'CRITICAL') return { label: 'Critical', tone: 'high', Icon: Flag };
  const reminder = lifeReminderLabel(task.lifeReminderType);
  if (reminder) return { label: reminder, tone: 'reminder', Icon: Bell };
  if (task.priority === 'HIGH') return { label: 'High', tone: 'high', Icon: Flag };
  if (task.priority === 'LOW') return { label: 'Low', tone: 'low', Icon: Tag };
  return task.startAt ? { label: 'Planned', tone: 'planned', Icon: CalendarDays } : { label: 'Normal', tone: 'medium', Icon: BarChart3 };
}

/**
 * The signed-in Tasks page. Tasks, Folders and Notes on the left; Task Insights, Quick Add (task,
 * reminder, event, note) and the Pomodoro Focus Timer on the right. Tasks load once and are grouped and
 * filtered in the browser, so the counts always match the lists.
 */
export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeZone, setTimeZone] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [foldersError, setFoldersError] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  const [remindersError, setRemindersError] = useState('');
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
  const [deletingReminder, setDeletingReminder] = useState<ReminderItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [userId, setUserId] = useState('');
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);
  const [sortChoice, setSortChoice] = useState<SortChoice>('Due Date');
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [tab, setTab] = useState<'tasks' | 'folders' | 'reminders' | 'notes'>('tasks');
  const [openFolder, setOpenFolder] = useState<string | null | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<Set<TaskBucket>>(new Set());
  const [creating, setCreating] = useState<{ folderId: string | null; title: string } | null>(null);
  const [quick, setQuick] = useState<'reminder' | 'event' | null>(null);
  const [noteSheet, setNoteSheet] = useState<{ note: Note | null } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [popover, setPopover] = useState<'filters' | 'sort' | null>(null);
  const [quickText, setQuickText] = useState('');
  const [adding, setAdding] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orders, setOrders] = useState<TaskDisplayOrders>({});
  const [dragging, setDragging] = useState<{ id: string; section: TaskBucket } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const searchInput = useRef<HTMLInputElement>(null);
  const focusCard = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const pomodoro = usePomodoro(userId);

  const say = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 6000);
  }, []);

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/tasks', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('tasks');
      const data = await response.json();
      if (signal?.aborted) return;
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setTimeZone(data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      setLoadFailed(false);
      setNow(Date.now());
    } catch {
      if (!signal?.aborted) setLoadFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  const loadFolders = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/projects', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('folders');
      const data = await response.json();
      if (signal?.aborted) return;
      setFolders(Array.isArray(data.projects) ? data.projects : []);
      setFoldersLoaded(true);
      setFoldersError('');
    } catch {
      if (!signal?.aborted) setFoldersError('Couldn’t load your folders.');
    }
  }, []);
  const loadNotes = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/notes', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('notes');
      const data = await response.json();
      if (signal?.aborted) return;
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      setNotesLoaded(true);
      setNotesError('');
    } catch {
      if (!signal?.aborted) setNotesError('Couldn’t load your notes.');
    }
  }, []);
  const loadReminders = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/reminders', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('reminders');
      const data = await response.json();
      if (signal?.aborted) return;
      setReminders(Array.isArray(data.reminders) ? data.reminders : []);
      setRemindersLoaded(true);
      setRemindersError('');
    } catch {
      if (!signal?.aborted) setRemindersError('Couldn’t load your reminders.');
    }
  }, []);
  // Reminders are part of the task list, so anything that reloads tasks refreshes their history too.
  const reload = useCallback(async () => { await Promise.all([loadTasks(), loadFolders(), loadReminders()]); }, [loadTasks, loadFolders, loadReminders]);
  async function deleteReminder(reminder: ReminderItem) {
    setDeletingBusy(true);
    try {
      const response = await fetch(`/api/reminders/${reminder.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('delete');
      setReminders((list) => list.filter((r) => r.id !== reminder.id));
      say(`Reminder deleted: “${reminder.title}”.`);
      void reload();
    } catch {
      setError('Couldn’t delete this reminder. Please try again.');
    } finally {
      setDeletingBusy(false);
      setDeletingReminder(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    // The first loads, and the saved order from browser storage, arrive after the first frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTasks(controller.signal);
    void loadFolders(controller.signal);
    void loadNotes(controller.signal);
    void loadReminders(controller.signal);
    fetch('/api/me', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!controller.signal.aborted && data?.user?.id) setUserId(data.user.id); })
      .catch(() => { /* The timer and manual order wait for the account. */ });
    try { setOrders(parseTaskDisplayOrders(window.localStorage.getItem(TASK_DISPLAY_ORDERS_KEY))); } catch { /* Storage is optional. */ }
    return () => controller.abort();
  }, [loadTasks, loadFolders, loadNotes, loadReminders]);

  const idle = !creating && !quick && !noteSheet && !editingId && !editingReminder && !deletingReminder && !busy && !completingId && !dragging && !adding;
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && idle) void reload(); };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('harbor:tasks-updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('harbor:tasks-updated', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [idle, reload]);

  useEffect(() => {
    const open = () => setCreating({ folderId: null, title: '' });
    window.addEventListener('harbor:tasks-add', open);
    return () => window.removeEventListener('harbor:tasks-add', open);
  }, []);

  // Close the row menu and the filter popovers on an outside click or Escape.
  useEffect(() => {
    if (!menuFor && !popover) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(event.target instanceof Element && event.target.closest('.tk-menu, .tk-pop'))) { setMenuFor(null); setPopover(null); }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menuFor, popover]);

  const zone = timeZone || 'UTC';
  const effective = useMemo<TaskFilters>(() => ({ ...filters, sort: sortChoice === 'My Order' ? 'Due Date' : sortChoice }), [filters, sortChoice]);
  const sections = useMemo(() => taskSections(tasks, effective, zone, now), [tasks, effective, zone, now]);
  const stats = useMemo(() => taskStats(tasks, zone, now), [tasks, zone, now]);
  const week = useMemo(() => weeklyProgress(tasks, zone, now), [tasks, zone, now]);
  const folderNames = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);
  const editing = editingId ? tasks.find((task) => task.id === editingId) ?? null : null;
  const manual = sortChoice === 'My Order' && Boolean(userId);
  const filtered = filters.chip !== 'All Tasks' || filters.status !== 'Open' || filters.priority !== 'All' || filters.highPriority || filters.search.trim().length > 0;

  const short = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric' }).format(new Date(at));
  const weekdayShort = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(at));
  const clockTime = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  const sectionSub: Record<TaskBucket, string> = {
    overdue: 'Before today', today: weekdayShort(now), tomorrow: weekdayShort(addDays(now, 1, zone)),
    week: `${short(addDays(now, 2, zone))} – ${short(addDays(now, 6, zone))}`, later: `After ${short(addDays(now, 6, zone))}`, unscheduled: 'No date', completed: 'Done',
  };
  function subtitle(task: Task, bucket: TaskBucket) {
    if (isDone(task)) { const at = parseServerDate(task.completedAt ?? null); return at === null ? 'Completed' : `Completed ${weekdayShort(at)}`; }
    const at = parseServerDate(task.startAt ?? task.dueAt);
    if (at === null) return minutesLabel(task.durationMin);
    const day = bucket === 'today' || bucket === 'tomorrow' ? '' : `${weekdayShort(at)} · `;
    const length = minutesLabel(task.durationMin);
    return `${day}${clockTime(at)}${length ? ` · ${length}` : ''}`;
  }

  function saveOrders(next: TaskDisplayOrders | null) {
    if (!next) return;
    setOrders(next);
    try { window.localStorage.setItem(TASK_DISPLAY_ORDERS_KEY, JSON.stringify(next)); } catch { /* Storage is optional. */ }
  }
  async function patch(id: string, body: Record<string, unknown>, message: string) {
    const response = await scheduleFetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(message);
  }
  /** The row stays put until the save succeeds, then slides out; a failed save leaves it as it was. */
  async function toggleComplete(task: Task) {
    if (completingId || busy) return;
    const done = isDone(task);
    setCompletingId(task.id);
    setError('');
    try {
      await patch(task.id, { status: done ? 'PLANNED' : 'COMPLETED' }, 'Couldn’t update your task. Refresh to check its current state before retrying.');
      if (!done && filters.status === 'Open') { setLeavingId(task.id); await new Promise((resolve) => window.setTimeout(resolve, 250)); }
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t update your task.');
    } finally {
      setCompletingId(null);
      setLeavingId(null);
    }
  }
  async function startTask(task: Task) {
    setBusy(true);
    try { await patch(task.id, { status: 'IN_PROGRESS' }, 'Could not start your task. Please try again.'); await reload(); return true; }
    catch { return false; }
    finally { setBusy(false); }
  }
  function focusOn(title: string) {
    if (!pomodoro.start(title)) { say(pomodoro.running ? 'A focus session is already running.' : 'The focus timer is still loading. Try again in a moment.'); return; }
    focusCard.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function quickAdd() {
    const title = quickText.trim();
    if (!title) { setCreating({ folderId: null, title: '' }); return; }
    if (adding || !timeZone) return;
    setAdding(true);
    setError('');
    try {
      const startAt = spacedCreationStart(Date.now(), 30, tasks);
      const response = await scheduleFetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, durationMin: 30, startAt: new Date(startAt).toISOString(), idempotencyKey: crypto.randomUUID() }) });
      if (!response.ok) throw new Error('Couldn’t add your task. Please try again.');
      setQuickText('');
      say(`Added “${title}” for today at ${clockTime(startAt)}.`);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t add your task.');
    } finally {
      setAdding(false);
    }
  }
  const askNexdo = (prompt?: string) => window.dispatchEvent(prompt ? new CustomEvent('harbor:open-assistant', { detail: { prompt } }) : new Event('harbor:open-assistant'));
  const toggleSection = (bucket: TaskBucket) => setCollapsed((current) => { const next = new Set(current); if (next.has(bucket)) next.delete(bucket); else next.add(bucket); return next; });

  function rowMenu(task: Task) {
    const done = isDone(task);
    return <div className="tk-menu">
      <button type="button" className="tk-more" aria-label={`More actions for ${task.title}`} aria-haspopup="menu" aria-expanded={menuFor === task.id} onClick={() => setMenuFor((current) => (current === task.id ? null : task.id))}><MoreHorizontal size={20} aria-hidden="true" /></button>
      {menuFor === task.id && <div className="tk-menu-list" role="menu">
        <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setEditingId(task.id); }}><FileText size={17} aria-hidden="true" />Open details</button>
        {!done && <button type="button" role="menuitem" disabled={pomodoro.running} onClick={() => { setMenuFor(null); focusOn(task.title); }}><Timer size={17} aria-hidden="true" />Focus on this</button>}
        {!done && task.status !== 'IN_PROGRESS' && <button type="button" role="menuitem" onClick={() => { setMenuFor(null); void startTask(task); }}><PlayCircle size={17} aria-hidden="true" />Start task</button>}
        <button type="button" role="menuitem" onClick={() => { setMenuFor(null); void toggleComplete(task); }}>{done ? <Circle size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}{done ? 'Mark incomplete' : 'Mark complete'}</button>
      </div>}
    </div>;
  }

  function checkbox(task: Task, completing = false) {
    const done = isDone(task);
    return <button type="button" className="tk-check" role="checkbox" aria-checked={done || completing} disabled={busy || completingId !== null} aria-label={`${done ? 'Restore' : 'Complete'} ${task.title}`} onClick={() => void toggleComplete(task)}>{(done || completing) && <Check size={14} strokeWidth={3} aria-hidden="true" />}</button>;
  }

  function card(task: Task, bucket: TaskBucket) {
    const badge = badgeFor(task);
    return <li key={task.id} className={`tk-card-task ${isDone(task) ? 'is-done' : ''}`}>
      <div>{checkbox(task, completingId === task.id)}{rowMenu(task)}</div>
      <button type="button" className="tk-row-open" disabled={!timeZone} onClick={() => setEditingId(task.id)}><span className="tk-row-title">{task.title}</span><span className="tk-row-sub">{subtitle(task, bucket)}</span></button>
      <span className="tk-badge" data-tone={badge.tone}><badge.Icon size={14} aria-hidden="true" />{badge.label}</span>
    </li>;
  }

  function taskRow(task: Task, bucket: TaskBucket, group: Task[], index: number) {
    const done = isDone(task);
    const completing = completingId === task.id && !done;
    const badge = badgeFor(task);
    const folderName = task.projectId ? folderNames.get(task.projectId) : undefined;
    const movable = manual && view === 'list' && group.length > 1 && bucket !== 'completed';
    return <li key={task.id} className={`tk-row ${done || completing ? 'is-done' : ''} ${leavingId === task.id ? 'is-leaving' : ''} ${dropTarget === task.id ? 'is-drop-target' : ''}`}
      draggable={movable}
      onDragStart={(event) => { event.dataTransfer.setData('text/plain', `nexdo-task:${task.id}`); event.dataTransfer.effectAllowed = 'move'; setDragging({ id: task.id, section: bucket }); }}
      onDragEnd={() => { setDragging(null); setDropTarget(null); }}
      onDragOver={(event) => { if (dragging?.section === bucket && dragging.id !== task.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(task.id); } }}
      onDragLeave={() => setDropTarget((current) => (current === task.id ? null : current))}
      onDrop={(event) => { event.preventDefault(); if (dragging?.section === bucket) saveOrders(reorderTasks(orders, userId, dragging.id, task.id, group)); setDragging(null); setDropTarget(null); }}>
      {checkbox(task, completing)}
      <button type="button" className="tk-row-open" aria-label={`${task.title}, ${subtitle(task, bucket)}. Opens task details`} disabled={!timeZone} onClick={() => setEditingId(task.id)}>
        <span className="tk-row-title">{task.title}</span>
        <span className="tk-row-sub">{task.startAt && !done && <CalendarDays size={13} aria-hidden="true" />}{subtitle(task, bucket)}{folderName && <><span aria-hidden="true"> · </span><FolderIcon size={12} aria-hidden="true" />{folderName}</>}</span>
      </button>
      <span className="tk-badge" data-tone={badge.tone}><badge.Icon size={14} aria-hidden="true" />{badge.label}</span>
      {movable && <span className="nx-row-moves">
        <button type="button" aria-label={`Move ${task.title} up`} disabled={index === 0} onClick={() => saveOrders(reorderTasks(orders, userId, task.id, group[index - 1].id, group))}><ChevronUp size={15} aria-hidden="true" /></button>
        <button type="button" aria-label={`Move ${task.title} down`} disabled={index === group.length - 1} onClick={() => saveOrders(reorderTasks(orders, userId, task.id, group[index + 1].id, group))}><ChevronDown size={15} aria-hidden="true" /></button>
      </span>}
      {rowMenu(task)}
    </li>;
  }

  const board = useMemo(() => {
    if (view !== 'board') return null;
    const all = taskSections(tasks, { ...effective, status: 'All' }, zone, now).flatMap((section) => section.tasks);
    const weekAgo = now - 7 * 86_400_000;
    return [
      { key: 'todo', title: 'To Do', tasks: all.filter((task) => task.status === 'INBOX' || task.status === 'PLANNED') },
      { key: 'progress', title: 'In Progress', tasks: all.filter((task) => task.status === 'IN_PROGRESS') },
      { key: 'waiting', title: 'Waiting', tasks: all.filter((task) => task.status === 'WAITING') },
      { key: 'done', title: 'Completed (7d)', tasks: all.filter((task) => task.status === 'COMPLETED' && (parseServerDate(task.completedAt ?? null) ?? 0) >= weekAgo) },
    ];
  }, [view, tasks, effective, zone, now]);

  const donut = 2 * Math.PI * 42;
  const peak = Math.max(1, ...week.days);

  return <div className="nx-tasks tk-page">
    <div className="tk-top">
      <header className="tk-hero">
        <div><h1>Tasks</h1><p>Turn intention into action. Manage, prioritize, and complete what matters.</p></div>
        <Image src="/tasks/clipboard.webp" alt="" width={320} height={231} className="tk-hero-art" priority />
      </header>
      <div className="tk-stats" aria-label="Task counts">
        <p className="tk-stat" data-tone="total"><ListTodo size={26} aria-hidden="true" /><span><strong>{stats.total}</strong><small>Total Tasks</small></span></p>
        <p className="tk-stat" data-tone="overdue"><Clock3 size={26} aria-hidden="true" /><span><strong>{stats.overdue}</strong><small>Overdue</small></span></p>
        <p className="tk-stat" data-tone="todo"><CircleCheck size={26} aria-hidden="true" /><span><strong>{stats.todo}</strong><small>To Do</small></span></p>
        <p className="tk-stat" data-tone="progress"><PlayCircle size={26} aria-hidden="true" /><span><strong>{stats.inProgress}</strong><small>In Progress</small></span></p>
        <p className="tk-stat" data-tone="done"><CheckCircle2 size={26} aria-hidden="true" /><span><strong>{stats.completed}</strong><small>Completed (7d)</small></span></p>
      </div>
    </div>

    <div className="tk-body">
      <div className="tk-tabs-row">
        <div className="tk-tabs" role="tablist" aria-label="Tasks, folders, reminders and notes">
          <button type="button" role="tab" aria-selected={tab === 'tasks'} onClick={() => setTab('tasks')}><List size={20} aria-hidden="true" />Tasks</button>
          <button type="button" role="tab" aria-selected={tab === 'folders'} onClick={() => setTab('folders')}><FolderIcon size={20} aria-hidden="true" />Folders</button>
          <button type="button" role="tab" aria-selected={tab === 'reminders'} onClick={() => { setTab('reminders'); void loadReminders(); }}><Bell size={20} aria-hidden="true" />Reminders</button>
          <button type="button" role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}><FileText size={20} aria-hidden="true" />Notes</button>
        </div>
        {tab === 'tasks' && <div className="tk-tools">
          <div className="tk-views" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'list'} aria-label="List view" title="List" onClick={() => setView('list')}><List size={20} aria-hidden="true" /></button>
            <button type="button" aria-pressed={view === 'grid'} aria-label="Card view" title="Cards" onClick={() => setView('grid')}><LayoutGrid size={20} aria-hidden="true" /></button>
            <button type="button" aria-pressed={view === 'board'} aria-label="Board view" title="Board" onClick={() => setView('board')}><SquareKanban size={20} aria-hidden="true" /></button>
          </div>
          <button type="button" className="tk-round" aria-label="Search tasks" aria-pressed={searchOpen} onClick={() => { if (searchOpen) { setSearchOpen(false); setFilters((value) => ({ ...value, search: '' })); } else { setSearchOpen(true); window.setTimeout(() => searchInput.current?.focus(), 0); } }}><Search size={21} aria-hidden="true" /></button>
        </div>}
      </div>

      {error && <p role="alert" className="nx-error">{error}</p>}
      {notice && <p role="status" className="nx-notice">{notice}</p>}

      {tab === 'folders' ? (openFolder === undefined
        ? <FolderList folders={folders} tasks={tasks} loaded={foldersLoaded} error={foldersError} onRetry={() => void loadFolders()} onOpen={setOpenFolder} onChanged={reload} />
        : <FolderDetail folderId={openFolder} folders={folders} foldersLoaded={foldersLoaded} tasks={tasks} tasksLoading={loading} timeZone={zone} onBack={() => setOpenFolder(undefined)} onOpenTask={setEditingId} onAddTask={(folderId) => setCreating({ folderId, title: '' })} onChanged={reload} />)
      : tab === 'reminders' ? <RemindersPanel reminders={reminders} loaded={remindersLoaded} error={remindersError} timeZone={zone} now={now} onRetry={() => void loadReminders()} onEdit={setEditingReminder} onDelete={setDeletingReminder} onNew={() => setQuick('reminder')} />
      : tab === 'notes' ? <NotesPanel notes={notes} loaded={notesLoaded} error={notesError} timeZone={zone} onRetry={() => void loadNotes()} onOpen={(note) => setNoteSheet({ note })} onNew={() => setNoteSheet({ note: null })} />
      : <div role="tabpanel" aria-label="Tasks">
        <form className="tk-add" onSubmit={(event) => { event.preventDefault(); void quickAdd(); }}>
          <button type="submit" className="tk-add-plus" aria-label={quickText.trim() ? 'Add this task' : 'Add a task with details'} disabled={adding || !timeZone}><Plus size={22} aria-hidden="true" /></button>
          <input value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder="Add a task…" aria-label="Add a task" maxLength={300} autoComplete="off" disabled={adding} />
          <button type="button" className="tk-add-more" aria-label="Add with date, folder and estimate" title="Add with details" disabled={!timeZone} onClick={() => { setCreating({ folderId: null, title: quickText.trim() }); setQuickText(''); }}><SlidersHorizontal size={19} aria-hidden="true" /></button>
          <button type="button" className="tk-add-ai" aria-label="Ask Nexdo to add or plan this" title="Ask Nexdo" onClick={() => { const text = quickText.trim(); askNexdo(text ? `Add a task: ${text}` : undefined); setQuickText(''); }}><Sparkles size={22} aria-hidden="true" /></button>
        </form>

        {searchOpen && <label className="nx-search tk-search">
          <Search size={18} aria-hidden="true" />
          <input ref={searchInput} type="search" autoComplete="off" placeholder="Search titles and notes across all tasks" aria-label="Search tasks" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <button type="button" aria-label="Close search" onClick={() => { setSearchOpen(false); setFilters({ ...filters, search: '' }); }}><X size={18} aria-hidden="true" /></button>
        </label>}

        <div className="tk-chips-row">
          <div className="tk-chips" role="group" aria-label="Show tasks">
            {TASK_CHIPS.map((chip) => <button key={chip} type="button" aria-pressed={filters.chip === chip && !filters.highPriority} onClick={() => setFilters({ ...filters, chip, highPriority: false })}>{chip === 'All Tasks' ? <ListChecks size={15} aria-hidden="true" /> : <CalendarDays size={15} aria-hidden="true" />}{chip}</button>)}
            <button type="button" className="tk-chip-high" aria-pressed={filters.highPriority} onClick={() => setFilters({ ...filters, highPriority: !filters.highPriority })}><Flag size={15} aria-hidden="true" />High Priority</button>
            <div className="tk-pop">
              <button type="button" aria-expanded={popover === 'filters'} aria-haspopup="dialog" data-active={filters.status !== 'Open' || filters.priority !== 'All'} onClick={() => setPopover((value) => (value === 'filters' ? null : 'filters'))}>More Filters<ChevronDown size={15} aria-hidden="true" /></button>
              {popover === 'filters' && <div className="tk-pop-panel" role="dialog" aria-label="More filters">
                <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as TaskFilters['status'] })}>{['Open', 'Completed', 'All'].map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>Priority<select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>{['All', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW'].map((value) => <option key={value} value={value}>{value === 'All' ? 'All' : value.charAt(0) + value.slice(1).toLowerCase()}</option>)}</select></label>
                <button type="button" className="nx-text-button" onClick={() => { setFilters({ ...DEFAULT_TASK_FILTERS, search: filters.search }); setPopover(null); }}>Reset filters</button>
              </div>}
            </div>
          </div>
          <div className="tk-pop tk-sort">
            <button type="button" aria-expanded={popover === 'sort'} aria-haspopup="listbox" onClick={() => setPopover((value) => (value === 'sort' ? null : 'sort'))}>Sort: {sortChoice}<ChevronDown size={15} aria-hidden="true" /></button>
            {popover === 'sort' && <div className="tk-pop-panel tk-pop-right" role="listbox" aria-label="Sort tasks">{SORT_CHOICES.map((choice) => <button key={choice} type="button" role="option" aria-selected={sortChoice === choice} onClick={() => { setSortChoice(choice); setPopover(null); }}>{choice}{sortChoice === choice && <Check size={16} aria-hidden="true" />}</button>)}
              <p>My Order: drag tasks, or use the arrows, to set the order within a day. It is kept in this browser.</p></div>}
          </div>
        </div>

        {loading && !tasks.length ? <p role="status" className="nx-status">Loading tasks…</p> : <>
          {loadFailed && <p role="alert" className="nx-error">Couldn’t load your tasks.<button type="button" onClick={() => void loadTasks()}>Retry</button></p>}
          {view === 'board' && board ? <div className="tk-board">{board.map((column) => <section key={column.key} className="tk-column" data-key={column.key} aria-label={column.title}>
            <h2>{column.title}<span>{column.tasks.length}</span></h2>
            {column.tasks.length ? <ul>{column.tasks.map((task) => card(task, 'later'))}</ul> : <p className="tk-column-empty">Nothing here.</p>}
          </section>)}</div>
          : sections.length ? sections.map((section) => {
            const rows = manual && section.bucket !== 'completed' ? orderedTasks(section.tasks, orders, userId) : section.tasks;
            const open = !collapsed.has(section.bucket);
            return <section key={section.bucket} className="tk-section" data-bucket={section.bucket} aria-labelledby={`tk-section-${section.bucket}`}>
              <button type="button" className="tk-section-head" aria-expanded={open} aria-controls={`tk-rows-${section.bucket}`} onClick={() => toggleSection(section.bucket)}>
                <CalendarDays size={22} aria-hidden="true" />
                <strong id={`tk-section-${section.bucket}`}>{SECTION_TITLES[section.bucket]}</strong>
                <span className="tk-section-sub">{sectionSub[section.bucket]}</span>
                <span className="tk-count">{section.tasks.length} {section.tasks.length === 1 ? 'task' : 'tasks'}</span>
                {open ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
              </button>
              {open && <ul id={`tk-rows-${section.bucket}`} className={view === 'grid' ? 'tk-grid' : 'tk-rows'}>{rows.map((task, index) => (view === 'grid' ? card(task, section.bucket) : taskRow(task, section.bucket, rows, index)))}</ul>}
            </section>;
          }) : !loadFailed && <div className="nx-status tk-empty">
            <Image src="/tasks/clipboard.webp" alt="" width={200} height={144} className="tk-empty-art" />
            <h2>{filters.search.trim() ? 'No matching tasks' : filtered ? 'Nothing here' : 'You’re all caught up'}</h2>
            <p>{filtered ? 'Try another filter, or add a task.' : 'Add a task above, or ask Nexdo to plan your day.'}</p>
            {filtered && <button type="button" className="nx-outline-button" onClick={() => { setFilters(DEFAULT_TASK_FILTERS); setSearchOpen(false); }}>Show all tasks</button>}
          </div>}
        </>}
      </div>}
    </div>

    <aside className="tk-rail" aria-label="Insights, quick add and focus timer">
      <section className="tk-card" aria-labelledby="tk-insights-title">
        <div className="tk-card-head">
          <h2 id="tk-insights-title"><BarChart3 size={22} aria-hidden="true" />Task Insights</h2>
          <button type="button" className="tk-head-link" aria-label="Show completed tasks" title="Show completed tasks" onClick={() => { setTab('tasks'); setView('list'); setFilters({ ...DEFAULT_TASK_FILTERS, status: 'Completed' }); }}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <div className="tk-insight">
          <svg viewBox="0 0 100 100" className="tk-donut" role="img" aria-label={`${week.percent}% of this week’s tasks completed`}>
            <defs><linearGradient id="tk-donut-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient></defs>
            <circle cx="50" cy="50" r="42" fill="none" stroke="#ece8fb" strokeWidth="10" />
            {week.completed > 0 && <circle cx="50" cy="50" r="42" fill="none" stroke="url(#tk-donut-gradient)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(week.percent / 100) * donut} ${donut}`} transform="rotate(-90 50 50)" />}
            <text x="50" y="57" textAnchor="middle">{week.percent}%</text>
          </svg>
          <div><h3>Weekly Progress</h3><p>{week.total ? <><strong>{week.completed}</strong> of <strong>{week.total}</strong> tasks completed</> : 'No tasks this week yet'}</p></div>
        </div>
        <ol className="tk-bars" aria-label="Tasks completed each day this week">{week.days.map((count, index) => <li key={WEEKDAYS[index]} className={index === week.todayIndex ? 'is-today' : index > week.todayIndex ? 'is-future' : ''} aria-label={`${WEEKDAYS[index]}: ${count} completed`}>
          <span style={{ height: `${Math.max(8, Math.round((count / peak) * 100))}%` }} data-zero={count === 0} />
          <small>{WEEKDAYS[index]}</small>
        </li>)}</ol>
      </section>

      <section className="tk-card" aria-labelledby="tk-quick-title">
        <div className="tk-card-head"><h2 id="tk-quick-title"><Zap size={22} aria-hidden="true" />Quick Add</h2></div>
        <div className="tk-quick">
          <button type="button" disabled={!timeZone} onClick={() => setCreating({ folderId: null, title: '' })}><CircleCheck size={22} aria-hidden="true" />Task</button>
          <button type="button" disabled={!timeZone} onClick={() => setQuick('reminder')}><Bell size={22} aria-hidden="true" />Reminder</button>
          <button type="button" disabled={!timeZone} onClick={() => setQuick('event')}><CalendarDays size={22} aria-hidden="true" />Event</button>
          <button type="button" onClick={() => setNoteSheet({ note: null })}><FileText size={22} aria-hidden="true" />Note</button>
        </div>
      </section>

      <div ref={focusCard}><FocusTimerCard pomodoro={pomodoro} timeZone={zone} /></div>
    </aside>

    {creating && timeZone && <TaskCreateSheet timeZone={timeZone} tasks={tasks} folders={folders} initialFolderId={creating.folderId} initialTitle={creating.title}
      onClose={() => setCreating(null)}
      onCreated={(title, scheduledAt) => { setCreating(null); say(`Added “${title}” for ${weekdayShort(scheduledAt)} at ${clockTime(scheduledAt)}.`); void reload(); }} />}
    {editingReminder && timeZone && <ReminderSheet key={editingReminder.id} timeZone={timeZone} reminder={editingReminder} onClose={() => setEditingReminder(null)}
      onSaved={(title, at) => { setEditingReminder(null); say(`Reminder updated: “${title}”, ${weekdayShort(at)} at ${clockTime(at)}.`); void reload(); }}
      onDeleted={() => { const title = editingReminder.title; setEditingReminder(null); setReminders((list) => list.filter((r) => r.id !== editingReminder.id)); say(`Reminder deleted: “${title}”.`); void reload(); }} />}
    {deletingReminder && <ConfirmDialog title="Delete this reminder?" message={`“${deletingReminder.title}” will be removed. Any pop-up, email or call still scheduled for it is cancelled.`} confirm="Delete reminder" busy={deletingBusy}
      onCancel={() => setDeletingReminder(null)} onConfirm={() => void deleteReminder(deletingReminder)} />}
    {quick === 'reminder' && timeZone && <ReminderSheet timeZone={timeZone} onClose={() => setQuick(null)} onSaved={(title, at) => { setQuick(null); say(`Reminder set: “${title}”, ${weekdayShort(at)} at ${clockTime(at)}.`); void reload(); }} />}
    {quick === 'event' && timeZone && <EventSheet timeZone={timeZone} onClose={() => setQuick(null)} onSaved={(title, message) => { setQuick(null); say(`Event added: “${title}”.${message ? ` ${message}` : ''}`); }} />}
    {noteSheet && <NoteSheet note={noteSheet.note} onClose={() => setNoteSheet(null)}
      onSaved={(note) => { const existing = Boolean(noteSheet.note); setNoteSheet(null); setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]); setNotesLoaded(true); say(existing ? 'Note saved.' : 'Note added. Find it under Notes.'); }}
      onDeleted={(id) => { setNoteSheet(null); setNotes((current) => current.filter((item) => item.id !== id)); say('Note deleted.'); }} />}

    {editing && timeZone && <TaskDetailSheet key={editing.id} task={editing} timeZone={timeZone} folders={folders}
      focusControl={<WorkControls task={editing} onStart={() => startTask(editing)} />}
      onClose={() => setEditingId(null)}
      onSaved={async () => { setEditingId(null); await reload(); }}
      onComplete={async () => { await patch(editing.id, { status: 'COMPLETED' }, 'Could not complete your task. Please try again.'); setEditingId(null); await reload(); }}
      onReopen={async () => { await patch(editing.id, { status: 'PLANNED' }, 'Could not reopen your task. Please try again.'); setEditingId(null); await reload(); }} />}
  </div>;
}

/** A 25-minute focus session and Start task, as at the top of Task Details on the phone. */
function WorkControls({ task, onStart }: { task: Task; onStart: () => Promise<boolean> }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  if (isDone(task)) return <p className="text-sm text-[var(--muted)]">Done</p>;
  return <div className="space-y-2">
    {['INBOX', 'PLANNED', 'IN_PROGRESS'].includes(task.status) && <FocusSessionControl taskId={task.id} title={task.title} />}
    <button type="button" className="harbor-btn w-full" disabled={starting || task.status === 'IN_PROGRESS'} onClick={async () => { setStarting(true); setError(''); try { if (!await onStart()) setError('Could not start your task. Please try again.'); } finally { setStarting(false); } }}>{task.status === 'IN_PROGRESS' ? 'Task in progress' : starting ? 'Starting…' : 'Start task'}</button>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}
