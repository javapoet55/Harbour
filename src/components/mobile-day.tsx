'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CalendarDays, CheckSquare, ChevronRight, ListFilter, X } from 'lucide-react';
import type { AgendaPayload, AgendaTask } from '@/lib/types';

type Props = {
  data: AgendaPayload; tasks: AgendaTask[]; completed: AgendaTask[];
  weather: React.ReactNode; snapshot: React.ReactNode; criticalFirst: boolean; toggleSort: () => void;
  openTask: (task: AgendaTask) => void; complete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>; add: (title: string) => Promise<void>;
};

export function MobileDay({ data, tasks, completed, weather, snapshot, criticalFirst, toggleSort, openTask, complete, restore, add }: Props) {
  const [days, setDays] = useState(1);
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [name, setName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [failure, setFailure] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = data.range.days[0];
  const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: data.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const rangeDays = data.range.days.slice(0, days);
  const itemsFor = (day: string) => [
    ...data.events.filter((event) => dayOf(event.startAt) === day).map((event) => ({ id: event.id, title: event.title, at: event.startAt, duration: Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000), task: null as AgendaTask | null })),
    ...data.tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status) && Boolean((task.startAt && dayOf(task.startAt) === day) || (task.dueAt && dayOf(task.dueAt) === day))).map((task) => ({ id: task.id, title: task.title, at: task.startAt ?? task.dueAt!, duration: task.durationMin, task })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  useEffect(() => {
    let cancelled = false;
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    void fetch('/api/me').then((r) => r.json()).then((value) => { if (!cancelled) setName(value.user?.name?.split(' ')[0] ?? ''); }).catch(() => {});
    const open = () => setShowAdd(true);
    window.addEventListener('harbor:quick-add', open);
    return () => { cancelled = true; window.clearInterval(clock); window.removeEventListener('harbor:quick-add', open); };
  }, []);
  useEffect(() => {
    if (showAdd) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [showAdd]);

  async function action(fn: () => Promise<void>) {
    setFailure('');
    try { await fn(); } catch { setFailure('Could not save that change. Please try again.'); }
  }

  return <div className="mobile-day md:hidden">
    <header className="mobile-greeting"><div><h1>{greeting}{name ? `, ${name}` : ''}</h1><p>{dateLabel(today, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p></div>{weather}</header>
    <div className="mobile-segments" role="group" aria-label="Agenda range">{[1, 3, 5].map((count) => <button key={count} aria-pressed={days === count} onClick={() => setDays(count)}>{count === 1 ? 'Today' : `${count} days`}</button>)}</div>
    {days !== 1 && data.overdue.length > 0 && <details className="mobile-overdue"><summary><AlertCircle size={22} /><span><strong>{data.overdue.length} overdue</strong> · {data.overdue[0].title}</span><ChevronRight size={18} /></summary><div>{data.overdue.map((task) => <button key={task.id} onClick={() => openTask(task)}>{task.title}<ChevronRight size={16} /></button>)}</div></details>}
    {failure && <p role="alert" className="text-sm text-[var(--danger)]">{failure}</p>}
    {days === 1 ? <>
      {snapshot}
      <div className="mobile-section-heading"><h2>Today’s tasks</h2><span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span><button aria-label="Sort critical tasks first" aria-pressed={criticalFirst} onClick={toggleSort}><ListFilter size={20} /></button></div>
      <div className="mobile-task-list">{tasks.length ? tasks.map((task) => <div className="mobile-task" key={task.id}>
        <button className="mobile-check" aria-label={`Complete ${task.title}`} onClick={() => void action(() => complete(task.id))} />
        <button className="mobile-task-content" onClick={() => openTask(task)} aria-label={`Open details for ${task.title}`}><span>{task.title}</span><small>{(task.critical || task.priority === 'CRITICAL') && <b className="mobile-critical">Critical</b>}{task.dueAt ? `Due ${time(task.dueAt)} · ` : ''}{task.durationMin} min</small></button>
        <button className="mobile-chevron" aria-label={`Edit ${task.title}`} onClick={() => openTask(task)}><ChevronRight size={19} /></button>
      </div>) : <p className="p-4 text-sm text-[var(--muted)]">You’re clear for today. Add a task with +.</p>}</div>
      <Link href="/tasks" className="mobile-all-tasks">View all tasks <ArrowRight size={18} /></Link>
      {completed.length > 0 && <details className="mobile-completed"><summary>Completed · {completed.length}</summary>{completed.map((task) => <button key={task.id} onClick={() => void action(() => restore(task.id))} aria-label={`Restore ${task.title}`}><CheckSquare size={18} /><span className="line-through">{task.title}</span></button>)}</details>}
    </> : <>
      <header className="mobile-range-heading"><h2>{dateLabel(rangeDays[0], { month: 'short', day: 'numeric' })} – {dateLabel(rangeDays[rangeDays.length - 1], { month: 'short', day: 'numeric' })}</h2><p>Includes today · {rangeDays.reduce((sum, day) => sum + itemsFor(day).length, 0)} items</p></header>
      <div className="mobile-agenda">{rangeDays.map((day, index) => {
        const items = itemsFor(day); const visible = expanded[day] ? items : items.slice(0, 2);
        return <section key={day}><h3>{index === 0 ? 'Today · ' : index === 1 ? 'Tomorrow · ' : ''}{dateLabel(day, { weekday: 'short', month: 'short', day: 'numeric' })}</h3><div>{visible.map((item) => <button className="mobile-agenda-row" key={`${item.task ? 'task' : 'event'}-${item.id}`} onClick={() => { if (item.task) openTask(item.task); else router.push('/calendar'); }}><time>{time(item.at)}</time>{item.task ? <CheckSquare size={21} /> : <CalendarDays size={21} />}<span>{item.title}<small>{item.duration} min · {item.task ? 'Task' : 'Calendar'}</small></span><ChevronRight size={17} /></button>)}{!items.length && <p className="p-4 text-sm text-[var(--muted)]">No items planned.</p>}{items.length > 2 && <button className="mobile-expand" onClick={() => setExpanded((value) => ({ ...value, [day]: !value[day] }))}>{expanded[day] ? 'Show less' : `+${items.length - 2} more ${index === 0 ? 'today' : index === 1 ? 'tomorrow' : ''}`}</button>}</div></section>;
      })}</div>
    </>}
    <dialog ref={dialogRef} className="mobile-add-dialog" onCancel={() => setShowAdd(false)} onClose={() => setShowAdd(false)}><form onSubmit={async (event) => { event.preventDefault(); if (saving || !newTitle.trim()) return; setSaving(true); try { await add(newTitle.trim()); setNewTitle(''); setShowAdd(false); } catch { setFailure('Could not add your task.'); } finally { setSaving(false); } }}><header><h2>Add a task</h2><button type="button" aria-label="Close add task" onClick={() => setShowAdd(false)}><X size={22} /></button></header><label htmlFor="mobile-new-task">What needs to get done?</label><input autoFocus id="mobile-new-task" className="harbor-input" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Task name" /><p className="my-3 text-sm text-[var(--muted)]">Added to today. Tap the task to edit its details.</p><button className="harbor-btn harbor-btn-brand w-full" disabled={saving || !newTitle.trim()}>{saving ? 'Adding…' : 'Add task'}</button></form></dialog>
  </div>;
}
