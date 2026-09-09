'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { TaskCreateDialog } from './task-create-dialog';
import { TaskDetailSheet } from './today-board';
import type { AgendaTask } from '@/lib/types';
import { taskDueLabel, type TaskTimeline } from '@/lib/task-timeline';
import { FocusSessionControl } from './focus-session';

type Task = AgendaTask & {
  project?: { name: string } | null;
  recurrence?: { frequency: string; interval: number; byWeekday: string | null } | null;
};

const TIMELINES: { value: TaskTimeline; label: string }[] = [
  { value: 'ALL', label: 'All' }, { value: 'TODAY', label: 'Today' },
  { value: 'TOMORROW', label: 'Tomorrow' }, { value: 'THIS_WEEK', label: 'This Week' },
];

export function TaskBrowser({ view = 'all' }: { view?: 'all' | 'open' | 'inbox' | 'waiting' }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [due, setDue] = useState('ALL');
  const [timeline, setTimeline] = useState<TaskTimeline>(view === 'open' ? 'TODAY' : 'ALL');
  const [timeZone, setTimeZone] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdMessage, setCreatedMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const canCreate = view === 'all' || view === 'open';
  const activeCount = [status, priority, due].filter((value) => value !== 'ALL').length;
  const label = (value: string) => value === 'COMPLETED' ? 'Done' : value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
  function reset() { setStatus('ALL'); setPriority('ALL'); setDue('ALL'); setSelected([]); }

  useEffect(() => {
    const open = () => setShowCreate(true);
    window.addEventListener('harbor:tasks-add', open);
    return () => window.removeEventListener('harbor:tasks-add', open);
  }, []);

  async function load(signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (status !== 'ALL') params.set('status', status);
    if (priority !== 'ALL') params.set('priority', priority);
    if (due !== 'ALL') params.set('due', due);
    if (timeline !== 'ALL') params.set('timeline', timeline);
    const res = await fetch(`/api/tasks?${params}`, { signal, cache: 'no-store' });
    if (!res.ok) {
      setError('Could not load tasks.');
      setLoading(false);
      return;
    }
    const data = await res.json();
    if (signal?.aborted) return;
    setTasks(data.tasks);
    setTimeZone(data.timeZone);
    setError('');
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSelected([]);
      setLoading(true);
      if (!cancelled) void load(controller.signal).catch(() => { if (!controller.signal.aborted) { setError('Could not load tasks. Try changing your search or refresh the page.'); setLoading(false); } });
    }, 180);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
    // load reruns when a search/filter value changes or a task is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, priority, due, timeline, revision]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !selecting && !editing && !showCreate && !busy) setRevision((value) => value + 1); };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('harbor:tasks-updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('harbor:tasks-updated', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [selecting, editing, showCreate, busy]);

  const shown = useMemo(() => tasks.filter((task) => {
    if (view === 'open' && status === 'ALL') return task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
    if (view === 'inbox') return task.status === 'INBOX' || !task.startAt;
    if (view === 'waiting') return task.status === 'WAITING';
    return true;
  }), [tasks, view, status]);

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Could not save your task. Please try again.');
      await load();
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your task.'); return false; }
    finally { setBusy(false); }
  }

  async function applyBulk() {
    if (!selected.length || !bulk || busy) return;
    const [field, value] = bulk.split(':');
    const ids = selected.filter((id) => shown.some((task) => task.id === id));
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await fetch('/api/tasks/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, [field]: value }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Bulk update failed.'); }
      setSelected([]); setBulk(''); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update your tasks.'); }
    finally { setBusy(false); }
  }

  return <div className="task-workspace">
    <div className="task-search-row"><label className="task-search"><Search size={20} aria-hidden /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your tasks" aria-label="Search tasks" /></label><button className="task-filter-trigger" onClick={() => dialog.current?.showModal()} aria-label={`Filters, ${activeCount} active`}><SlidersHorizontal size={20} /><span>Filters</span>{activeCount > 0 && <b>{activeCount}</b>}</button></div>
    <div className="task-chips" role="group" aria-label="Task timeline">{TIMELINES.map((item) => <button key={item.value} type="button" aria-pressed={timeline === item.value} onClick={() => { setTimeline(item.value); setSelected([]); setCreatedMessage(''); }}>{item.label}</button>)}</div>
    {activeCount > 0 && <div className="task-active-filters"><span>{[status, priority, due].filter((value) => value !== 'ALL').map(label).join(' · ')}</span><button onClick={reset}>Clear filters <X size={13} /></button></div>}
    <div className="task-list-heading"><p aria-live="polite">{loading ? 'Finding your tasks…' : `${shown.length} ${shown.length === 1 ? 'task' : 'tasks'}`}</p><button disabled={busy} onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? 'Done selecting' : 'Select tasks'}</button></div>
    {error && <p role="alert" className="task-error">{error}</p>}
    {createdMessage && <p role="status" className="mb-3 text-sm text-[#315c8f]">{createdMessage}</p>}
    {selecting && <div className="task-selection-bar"><label><input type="checkbox" disabled={!shown.length || busy} checked={shown.length > 0 && shown.every((task) => selected.includes(task.id))} onChange={(event) => setSelected(event.target.checked ? shown.map((task) => task.id) : [])} />Select all</label><span>{selected.length} selected</span>{selected.length > 0 && <div><select value={bulk} onChange={(event) => setBulk(event.target.value)} aria-label="Action for selected tasks"><option value="">Choose an action</option><option value="status:COMPLETED">Mark completed</option><option value="status:IN_PROGRESS">Start working</option><option value="status:WAITING">Mark waiting</option><option value="priority:CRITICAL">Make critical</option><option value="priority:HIGH">Make high priority</option><option value="energyLevel:HIGH">High energy</option><option value="energyLevel:LOW">Low energy</option><option value="status:CANCELLED">Cancel tasks</option></select><button disabled={!bulk || busy} onClick={() => void applyBulk()}>Apply</button></div>}</div>}
    {loading ? <p role="status" className="task-empty">Loading tasks…</p> : !shown.length ? <div className="task-empty"><Check size={32} /><h2>{timeline === 'TODAY' ? 'No tasks due today' : timeline === 'TOMORROW' ? 'No tasks due tomorrow' : timeline === 'THIS_WEEK' ? 'No tasks due this week' : 'No tasks here'}</h2><p>{query || activeCount ? 'Try a different search or clear your filters.' : timeline !== 'ALL' ? 'You’re clear for this period. Undated tasks are in All.' : canCreate ? 'A little breathing room. Add your next task here.' : 'A little breathing room. Nothing needs your attention here.'}</p>{(query || activeCount > 0 || timeline !== 'ALL') ? <button onClick={() => { reset(); setQuery(''); setTimeline('ALL'); }}>Show all tasks</button> : canCreate && <button type="button" onClick={() => setShowCreate(true)}>Add a task</button>}</div> : <div className="task-card-list">{shown.map((task) => <article key={task.id} className={`task-browser-card ${task.priority === 'CRITICAL' ? 'is-critical' : ''} ${task.status === 'COMPLETED' ? 'is-completed' : ''}`}>
      {selecting ? <input className="task-select-box" type="checkbox" disabled={busy} checked={selected.includes(task.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, task.id])] : current.filter((id) => id !== task.id))} aria-label={`Select ${task.title}`} /> : <button className="task-complete-circle" disabled={busy || task.status === 'COMPLETED'} aria-label={task.status === 'COMPLETED' ? `${task.title} completed` : `Complete ${task.title}`} onClick={() => void act(task.id, { status: 'COMPLETED' })}>{task.status === 'COMPLETED' && <Check size={16} />}</button>}
      <button type="button" className="task-row-details" aria-label={`Open details for ${task.title}`} disabled={busy || !timeZone} onClick={() => setEditing(task)}><span className="task-card-copy"><span className="task-row-title">{task.title}</span><span className="task-card-meta">{task.priority === 'CRITICAL' && <span className="task-priority priority-critical">Critical</span>}<span>{timeZone ? taskDueLabel(task, timeZone) : 'Loading date…'} · {task.durationMin} min</span></span></span><ChevronRight size={18} aria-hidden="true" /></button>
    </article>)}</div>}
    {showCreate && <TaskCreateDialog onClose={() => setShowCreate(false)} onCreated={(title) => { setShowCreate(false); reset(); setQuery(''); setTimeline('ALL'); setBulk(''); setSelecting(false); setCreatedMessage(`Added “${title}”. Showing all tasks.`); setRevision((value) => value + 1); }} />}
    {editing && timeZone && <TaskDetailSheet key={editing.id} task={editing} timeZone={timeZone} focusControl={<TaskWorkControls task={editing} onStart={async () => { const started = await act(editing.id, { status: 'IN_PROGRESS' }); if (started) setEditing({ ...editing, status: 'IN_PROGRESS' }); return started; }} />} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} onComplete={async () => { const response = await fetch(`/api/tasks/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) }); if (!response.ok) throw new Error('Could not complete your task. Please try again.'); setEditing(null); await load(); }} />}
    <dialog ref={dialog} className="task-filter-dialog"><form method="dialog"><header><div><p>MAKE IT YOURS</p><h2>Filter tasks</h2></div><button aria-label="Close filters"><X size={22} /></button></header><p className="task-filter-hint">Find just what you need to work on.</p><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Any status</option>{['INBOX', 'PLANNED', 'IN_PROGRESS', 'WAITING', 'COMPLETED'].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="ALL">Any priority</option>{['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label>When<select value={due} onChange={(event) => setDue(event.target.value)}><option value="ALL">Any time</option><option value="OVERDUE">Overdue</option><option value="NEXT_24_HOURS">Due in 24 hours</option><option value="UNSCHEDULED">Unscheduled</option></select></label><footer><button type="button" onClick={reset}>Reset</button><button className="task-show-results">Show tasks</button></footer></form></dialog>
  </div>;
}

function TaskWorkControls({ task, onStart }: { task: Task; onStart: () => Promise<boolean> }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  if (['COMPLETED', 'CANCELLED'].includes(task.status)) return <p className="text-sm text-[var(--muted)]">{task.status === 'COMPLETED' ? 'Done' : 'Cancelled'}</p>;
  return <div className="space-y-2">
    <FocusSessionControl taskId={task.id} title={task.title} />
    {task.status === 'IN_PROGRESS' ? <p className="text-sm text-[var(--brand)]">In progress</p> : <button type="button" className="harbor-btn w-full" disabled={starting} onClick={async () => { setStarting(true); setError(''); try { if (!await onStart()) setError('Could not start your task. Please try again.'); } finally { setStarting(false); } }}>{starting ? 'Starting…' : 'Start task'}</button>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}
