'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, FileText, Folder as FolderIcon, Laptop, ListChecks, Mail, Mic, Phone, Plus, Search, SlidersHorizontal, Wrench, XCircle } from 'lucide-react';
import { scheduleFetch } from '@/lib/schedule-fetch';
import type { AgendaTask } from '@/lib/types';
import {
  beginSearch, DATE_FILTER_EMPTY_TITLE, DEFAULT_TASK_QUERY, DISTANT_FUTURE, endSearch, isDone, revealCreatedTask, searchFilters, selectDate, snapshot,
  TASK_DATE_FILTERS, TASK_HISTORY_RANGES, type SearchFilters, type TaskHistoryRange, type TaskQuery,
} from '@/lib/task-query';
import {
  moveTask, orderedTasks, parseTaskDisplayOrders, reorderTasks, sectionDate, sectionTitle, TASK_DISPLAY_ORDERS_KEY, taskRowIcon, taskSubtitle,
  type Folder, type TaskDisplayOrders, type TaskRowIcon,
} from '@/lib/task-list';
import { TaskDetailSheet } from './today-board';
import { FocusSessionControl } from './focus-session';
import { TaskCreateSheet } from './task-create-sheet';
import { FolderDetail, FolderList } from './task-folders';
import './tasks-screen.css';

type Task = AgendaTask;

const HISTORY_HINT: Record<TaskHistoryRange, string> = {
  'All time': 'All open and completed tasks, with open tasks first.',
  'This Month': 'Tasks scheduled within this calendar month.',
  'Last Month': 'Previous calendar month, plus upcoming open tasks.',
  'Last 2 weeks': 'History through today, plus upcoming open tasks.',
};
const ROW_ICONS: Record<TaskRowIcon, typeof FileText> = { envelope: Mail, wrench: Wrench, phone: Phone, laptop: Laptop, calendar: Calendar, document: FileText };
const capitalized = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * The signed-in Tasks page. It mirrors the iPhone Tasks tab (`TasksView`, ios/App/RootView.swift):
 * Tasks and Folders, the Today / Tomorrow / This Week / All pills with their counts, day sections,
 * search across everything, filters, manual order within a day, and the same create and details flows.
 * Like the phone it loads every task once and filters in the browser, so the pill counts always agree
 * with the list they open.
 */
export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeZone, setTimeZone] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [foldersError, setFoldersError] = useState('');
  const [userId, setUserId] = useState('');
  const [query, setQuery] = useState<TaskQuery>(DEFAULT_TASK_QUERY);
  const [searching, setSearching] = useState(false);
  const beforeSearch = useRef<SearchFilters | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'tasks' | 'folders'>('tasks');
  const [openFolder, setOpenFolder] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState<{ folderId: string | null } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orders, setOrders] = useState<TaskDisplayOrders>({});
  const [dragging, setDragging] = useState<{ id: string; section: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const filterDialog = useRef<HTMLDialogElement>(null);

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
      // Keep what is on screen and offer a retry, as the phone does.
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

  const reload = useCallback(async () => { await Promise.all([loadTasks(), loadFolders()]); }, [loadTasks, loadFolders]);

  useEffect(() => {
    const controller = new AbortController();
    // The first load, and the saved order from browser storage, arrive after the first frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTasks(controller.signal);
    void loadFolders(controller.signal);
    fetch('/api/me', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!controller.signal.aborted && data?.user?.id) setUserId(data.user.id); })
      .catch(() => { /* Manual order simply stays off until the account is known. */ });
    try {
      setOrders(parseTaskDisplayOrders(window.localStorage.getItem(TASK_DISPLAY_ORDERS_KEY)));
    } catch { /* Storage is optional. */ }
    return () => controller.abort();
  }, [loadTasks, loadFolders]);

  const idle = !creating && !editingId && !filtering && !busy && !completingId && !dragging;
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && idle) void reload(); };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('harbor:tasks-updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('harbor:tasks-updated', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [idle, reload]);

  useEffect(() => {
    const open = () => setCreating({ folderId: null });
    window.addEventListener('harbor:tasks-add', open);
    return () => window.removeEventListener('harbor:tasks-add', open);
  }, []);

  const zone = timeZone || 'UTC';
  const list = useMemo(() => snapshot(query, tasks, zone, now), [query, tasks, zone, now]);
  const editing = editingId ? tasks.find((task) => task.id === editingId) ?? null : null;
  const priorities = useMemo(() => [...new Set(tasks.map((task) => task.priority))].sort(), [tasks]);
  const folderNames = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);
  const activeSearch = searching || query.search.length > 0;

  function toggleSearch() {
    if (searching) { closeSearch(); return; }
    beforeSearch.current ??= searchFilters(query);
    setQuery(beginSearch(query));
    setSearching(true);
    window.setTimeout(() => searchInput.current?.focus(), 0);
  }
  function closeSearch() {
    setQuery(endSearch(query, beforeSearch.current));
    beforeSearch.current = null;
    setSearching(false);
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

  /** The row keeps its place until the save succeeds, then slides out; a failed save leaves it there. */
  async function toggleComplete(task: Task) {
    if (completingId || busy) return;
    const done = isDone(task);
    setCompletingId(task.id);
    setError('');
    try {
      await patch(task.id, { status: done ? 'PLANNED' : 'COMPLETED' }, 'Couldn’t update your task. Refresh to check its current state before retrying.');
      if (!done) {
        setLeavingId(task.id);
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
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

  const header = <header className="nx-header">
    <div><h1>Tasks</h1><p>Turn intent into action.</p></div>
    {tab === 'tasks' && <>
      <button type="button" className="nx-icon-button" aria-label="Task filters" onClick={() => { setFiltering(true); filterDialog.current?.showModal(); }}><SlidersHorizontal size={21} aria-hidden="true" /></button>
      <button type="button" className="nx-icon-button" aria-label="Search tasks" aria-pressed={searching} onClick={toggleSearch}><Search size={21} aria-hidden="true" /></button>
    </>}
  </header>;

  return <div className="nx-tasks">
    {header}
    <div className="nx-segments" role="tablist" aria-label="Tasks and folders">
      <button type="button" role="tab" aria-selected={tab === 'tasks'} onClick={() => setTab('tasks')}>Tasks</button>
      <button type="button" role="tab" aria-selected={tab === 'folders'} onClick={() => { setTab('folders'); if (searching) closeSearch(); }}>Folders</button>
    </div>

    {error && <p role="alert" className="nx-error">{error}</p>}
    {notice && tab === 'tasks' && <p role="status" className="nx-notice">{notice}</p>}

    {tab === 'folders' ? (openFolder === undefined
      ? <FolderList folders={folders} tasks={tasks} loaded={foldersLoaded} error={foldersError} onRetry={() => void loadFolders()} onOpen={setOpenFolder} onChanged={reload} />
      : <FolderDetail folderId={openFolder} folders={folders} foldersLoaded={foldersLoaded} tasks={tasks} tasksLoading={loading} timeZone={zone} onBack={() => setOpenFolder(undefined)} onOpenTask={setEditingId} onAddTask={(folderId) => setCreating({ folderId })} onChanged={reload} />)
    : <div role="tabpanel" aria-label="Tasks">
      {activeSearch && <label className="nx-search">
        <Search size={18} aria-hidden="true" />
        <input ref={searchInput} type="search" autoComplete="off" autoCorrect="off" placeholder="Search your tasks" aria-label="Search tasks" value={query.search} onChange={(event) => setQuery({ ...query, search: event.target.value })} />
        <button type="button" aria-label="Close search" onClick={closeSearch}><XCircle size={18} aria-hidden="true" /></button>
      </label>}

      <div className="nx-create">
        <button type="button" className="is-voice" aria-label="Add by Voice" onClick={() => window.dispatchEvent(new Event('harbor:open-assistant'))}><span className="nx-create-icon"><Mic size={22} aria-hidden="true" /></span><span><strong>Add by Voice</strong><small>Tap and speak</small></span></button>
        <button type="button" aria-label="Add Manually" disabled={!timeZone} onClick={() => setCreating({ folderId: null })}><span className="nx-create-icon"><Plus size={24} aria-hidden="true" /></span><span><strong>Add Manually</strong><small>Type a task</small></span></button>
      </div>

      <div className="nx-pills" role="group" aria-label="Task dates">
        {TASK_DATE_FILTERS.map((filter) => <button key={filter} type="button" aria-pressed={query.date === filter} aria-label={`${filter}, ${list.counts[filter]} items`} onClick={() => { setNotice(''); setQuery(selectDate(query, filter, activeSearch)); }}>{filter}{filter !== 'All' && <span>{list.counts[filter]}</span>}</button>)}
      </div>

      {query.date === 'All' && !query.search.trim() && <div className="nx-history">
        <div><label htmlFor="nx-history-range">History range</label><select id="nx-history-range" value={query.historyRange} onChange={(event) => setQuery({ ...query, historyRange: event.target.value as TaskHistoryRange })}>{TASK_HISTORY_RANGES.map((range) => <option key={range}>{range}</option>)}</select></div>
        <p>{HISTORY_HINT[query.historyRange]}</p>
      </div>}

      {loading && !tasks.length ? <p role="status" className="nx-status">Loading tasks…</p> : <>
        {loadFailed && <p role="alert" className="nx-error">Couldn’t load your tasks.<button type="button" onClick={() => void loadTasks()}>Retry</button></p>}
        {!list.tasks.length && !loadFailed && !loading && <div className="nx-status">
          <ListChecks size={40} aria-hidden="true" />
          <h2>{query.search ? 'No matching tasks' : DATE_FILTER_EMPTY_TITLE[query.date]}</h2>
          <p>Try another filter or add a task.</p>
          <button type="button" className="nx-outline-button" onClick={() => setCreating({ folderId: null })}>Add Manually</button>
        </div>}
        {list.sections.map((section) => {
          const title = sectionTitle(section.date, zone, DISTANT_FUTURE, now);
          const dated = section.date !== DISTANT_FUTURE ? sectionDate(section.date, zone) : '';
          const rows = orderedTasks(section.tasks, orders, userId);
          return <section key={section.id} className="nx-section" aria-label={title}>
            <div className="nx-section-head">
              <Calendar size={26} aria-hidden="true" />
              {/* The date line is only under Today, Yesterday and Tomorrow: any other title is already the date. */}
              <div><h2>{section.isDone && query.status === 'All' ? `Completed · ${title}` : title}</h2>{dated && dated !== title && <p>{dated}</p>}</div>
              <span>{section.tasks.length} {section.tasks.length === 1 ? 'item' : 'items'}</span>
            </div>
            <div className="nx-rows">{rows.map((task, index) => {
              const done = isDone(task);
              const completing = completingId === task.id && !done;
              const icon = taskRowIcon(task.title);
              const Icon = ROW_ICONS[icon];
              const folderName = task.projectId ? folderNames.get(task.projectId) : undefined;
              return <article key={task.id} className={`nx-row ${done || completing ? 'is-done' : ''} ${leavingId === task.id ? 'is-leaving' : ''} ${dropTarget === task.id ? 'is-drop-target' : ''}`}
                draggable={Boolean(userId) && rows.length > 1}
                onDragStart={(event) => { event.dataTransfer.setData('text/plain', `nexdo-task:${task.id}`); event.dataTransfer.effectAllowed = 'move'; setDragging({ id: task.id, section: section.id }); }}
                onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                onDragOver={(event) => { if (dragging?.section === section.id && dragging.id !== task.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(task.id); } }}
                onDragLeave={() => setDropTarget((current) => (current === task.id ? null : current))}
                onDrop={(event) => { event.preventDefault(); if (dragging?.section === section.id) saveOrders(reorderTasks(orders, userId, dragging.id, task.id, section.tasks)); setDragging(null); setDropTarget(null); }}>
                <button type="button" className={`nx-check ${done || completing ? 'is-done' : ''}`} disabled={busy || completingId !== null} aria-label={`${done ? 'Restore' : 'Complete'} ${task.title}`} onClick={() => void toggleComplete(task)}>{done || completing ? <CheckCircle2 size={23} aria-hidden="true" /> : <Circle size={23} aria-hidden="true" />}</button>
                <button type="button" className="nx-row-open" disabled={completingId === task.id || !timeZone} aria-label={`${task.title}, ${taskSubtitle(task, zone)}. Opens task details`} onClick={() => setEditingId(task.id)}>
                  <span className="nx-row-icon" data-icon={icon} aria-hidden="true"><Icon size={22} /></span>
                  <span className="nx-row-copy">
                    <span className="nx-row-title">{task.title}</span>
                    <span className="nx-row-sub">{taskSubtitle(task, zone)}</span>
                    {folderName && <span className="nx-row-folder"><FolderIcon size={13} aria-hidden="true" />{folderName}</span>}
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
                {/* Display order only: the scheduled time stays the same. */}
                {userId && rows.length > 1 && <span className="nx-row-moves">
                  <button type="button" aria-label={`Move ${task.title} up`} disabled={index === 0} onClick={() => saveOrders(moveTask(orders, userId, task.id, -1, section.tasks))}><ChevronUp size={15} aria-hidden="true" /></button>
                  <button type="button" aria-label={`Move ${task.title} down`} disabled={index === rows.length - 1} onClick={() => saveOrders(moveTask(orders, userId, task.id, 1, section.tasks))}><ChevronDown size={15} aria-hidden="true" /></button>
                </span>}
              </article>;
            })}</div>
          </section>;
        })}
      </>}
    </div>}

    <dialog ref={filterDialog} className="nx-sheet" aria-labelledby="nx-filter-title" onClose={() => setFiltering(false)}>
      <form method="dialog">
        <header className="nx-sheet-head"><span /><h2 id="nx-filter-title">Task filters</h2><button className="nx-pill-button">Done</button></header>
        <div className="nx-sheet-body"><div className="nx-form-card">
          <label className="nx-form-row">Status<select value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value as TaskQuery['status'] })}>{['Open', 'Completed', 'All'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="nx-form-row">Priority<select value={query.priority} onChange={(event) => setQuery({ ...query, priority: event.target.value })}><option value="All">All</option>{[...new Set([...priorities, ...(query.priority === 'All' ? [] : [query.priority])])].sort().map((value) => <option key={value} value={value}>{capitalized(value)}</option>)}</select></label>
          {query.date !== 'All' && <label className="nx-form-row">Earliest due first<input type="checkbox" checked={query.earliestFirst} onChange={(event) => setQuery({ ...query, earliestFirst: event.target.checked })} /></label>}
          <button type="button" className="nx-text-button" onClick={() => setQuery({ ...query, status: 'Open', priority: 'All', earliestFirst: true })}>Reset filters</button>
        </div></div>
      </form>
    </dialog>

    {creating && timeZone && <TaskCreateSheet timeZone={timeZone} tasks={tasks} folders={folders} initialFolderId={creating.folderId}
      onClose={() => setCreating(null)}
      onVoice={() => { setCreating(null); window.dispatchEvent(new Event('harbor:open-assistant')); }}
      onCreated={(title, scheduledAt) => {
        setCreating(null);
        if (tab === 'tasks') {
          // Move the list to the day the task landed on and drop the filters that would hide it.
          beforeSearch.current = null;
          setSearching(false);
          setQuery(revealCreatedTask(query, scheduledAt, timeZone));
          setNotice(`Added “${title}”.`);
        }
        void reload();
      }} />}

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
