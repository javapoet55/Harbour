'use client';

import { useEffect, useMemo, useState } from 'react';

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  startAt: string | null;
  dueAt: string | null;
  waitingOn: string | null;
  durationMin: number;
  energyLevel: string;
  project?: { name: string } | null;
  recurrence?: { frequency: string; interval: number; byWeekday: string | null } | null;
};

export function TaskBrowser({ view = 'all' }: { view?: 'all' | 'open' | 'inbox' | 'waiting' }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [due, setDue] = useState('ALL');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState('');

  async function load(signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (status !== 'ALL') params.set('status', status);
    if (priority !== 'ALL') params.set('priority', priority);
    if (due !== 'ALL') params.set('due', due);
    const res = await fetch(`/api/tasks?${params}`, { signal });
    if (!res.ok) {
      setError('Could not load tasks.');
      return;
    }
    const data = await res.json();
    setTasks(data.tasks);
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!cancelled) void load(controller.signal).catch(() => undefined);
    }, 180);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
    // load intentionally reruns only when a search/filter value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, priority, due]);

  const shown = useMemo(() => tasks.filter((task) => {
    if (view === 'open') return task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
    if (view === 'inbox') return task.status === 'INBOX' || !task.startAt;
    if (view === 'waiting') return task.status === 'WAITING';
    return true;
  }), [tasks, view]);

  async function act(id: string, body: Record<string, unknown>) {
    await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await load();
  }

  async function applyBulk() {
    if (!selected.length || !bulk) return;
    const [field, value] = bulk.split(':');
    const res = await fetch('/api/tasks/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, [field]: value }) });
    if (!res.ok) { const data = await res.json(); setError(data.error || 'Bulk update failed.'); return; }
    setSelected([]); setBulk(''); await load();
  }

  if (error) return <p className="text-[var(--danger)]">{error}</p>;

  return (
    <div className="space-y-3">
      <div className="harbor-card grid gap-3 p-4 md:grid-cols-4">
        <input className="harbor-input md:col-span-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, notes, project, or person…" aria-label="Search tasks" />
        <select className="harbor-input" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status"><option value="ALL">All statuses</option><option value="INBOX">Inbox</option><option value="PLANNED">Planned</option><option value="IN_PROGRESS">In progress</option><option value="WAITING">Waiting</option><option value="COMPLETED">Completed</option></select>
        <select className="harbor-input" value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority"><option value="ALL">All priorities</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select>
        <select className="harbor-input" value={due} onChange={(event) => setDue(event.target.value)} aria-label="Filter by timing"><option value="ALL">Any timing</option><option value="OVERDUE">Overdue</option><option value="NEXT_24_HOURS">Due in 24 hours</option><option value="UNSCHEDULED">Unscheduled</option></select>
        <select className="harbor-input md:col-span-2" value={bulk} onChange={(event) => setBulk(event.target.value)} aria-label="Bulk action"><option value="">Bulk action…</option><option value="status:COMPLETED">Complete</option><option value="status:IN_PROGRESS">Start</option><option value="status:WAITING">Mark waiting</option><option value="priority:CRITICAL">Make critical</option><option value="priority:HIGH">Make high priority</option><option value="energyLevel:HIGH">High energy</option><option value="energyLevel:LOW">Low energy</option><option value="status:CANCELLED">Cancel</option></select>
        <button type="button" className="harbor-btn harbor-btn-brand" disabled={!selected.length || !bulk} onClick={() => void applyBulk()}>Apply to {selected.length}</button>
      </div>
      {!shown.length ? <div className="harbor-card p-6 text-[var(--muted)]">Nothing matches these filters.</div> : <div className="harbor-card divide-y divide-[var(--line)]">
      <label className="flex items-center gap-2 px-4 py-3 text-sm"><input type="checkbox" checked={selected.length === shown.length} onChange={(event) => setSelected(event.target.checked ? shown.map((task) => task.id) : [])} /> Select all {shown.length}</label>
      {shown.map((task) => (
        <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-start gap-3">
            <input className="mt-1" type="checkbox" checked={selected.includes(task.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, task.id])] : current.filter((id) => id !== task.id))} aria-label={`Select ${task.title}`} />
            <div>
            <p className="font-medium">{task.title}</p>
            <p className="text-xs uppercase tracking-wide text-[var(--faint)]">
              {task.status} · {task.priority} · {task.energyLevel} energy · {task.durationMin}m
              {task.project ? ` · ${task.project.name}` : ''}
              {task.recurrence ? ` · every ${task.recurrence.interval > 1 ? `${task.recurrence.interval} ` : ''}${task.recurrence.frequency.toLowerCase()}` : ''}
              {task.waitingOn ? ` · waiting on ${task.waitingOn}` : ''}
            </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="harbor-btn" onClick={() => void act(task.id, { status: 'IN_PROGRESS' })}>Start</button>
            <button type="button" className="harbor-btn" onClick={() => void act(task.id, { status: 'COMPLETED' })}>Complete</button>
          </div>
        </div>
      ))}
      </div>}
    </div>
  );
}
