'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, FileText, Plus, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { AgendaPayload, AgendaTask } from '@/lib/types';
import { itemsOnDay, localDay, monthDays, shiftDay, shiftMonth, weekStart, type CalendarItem } from '@/lib/calendar-view';
import { TaskDetailSheet } from './today-board';
import { ScheduleIntelligenceCard } from './schedule-intelligence-card';

const dateText = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
type View = 'schedule' | 'week' | 'month';
export function CalendarScreen() {
  const [view, setView] = useState<View>('schedule');
  const [selected, setSelected] = useState('');
  const [today, setToday] = useState('');
  const [data, setData] = useState<AgendaPayload | null>(null);
  const [range, setRange] = useState(3);
  const [kind, setKind] = useState('all');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<AgendaTask | null>(null);
  const [event, setEvent] = useState<CalendarItem | null>(null);
  const [saving, setSaving] = useState(false);
  const filterRef = useRef<HTMLDialogElement>(null);
  const eventRef = useRef<HTMLDialogElement>(null);
  const addRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addTime, setAddTime] = useState('09:00');
  const [addError, setAddError] = useState('');
  const days = selected ? view === 'month' ? monthDays(selected) : Array.from({ length: view === 'week' ? 7 : range }, (_, i) => shiftDay(view === 'week' ? weekStart(selected) : today, i)) : [];
  const from = days[0];
  const count = view === 'month' ? days.length || 42 : view === 'week' ? 7 : range;
  const zone = data?.timeZone;

  useEffect(() => {
    const controller = new AbortController();
    // This effect starts a new asynchronous range request; stale results stay hidden.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError('');
    fetch(`/api/agenda?days=${count}${from ? `&from=${from}` : ''}`, { signal: controller.signal }).then(async (res) => { const payload = await res.json(); if (!res.ok) throw new Error(payload.error || 'Could not load your calendar.'); return payload as AgendaPayload; }).then((payload) => {
      if (controller.signal.aborted) return;
      setData(payload); setLoading(false);
      if (!from) { const day = localDay(new Date().toISOString(), payload.timeZone); setToday(day); setSelected(day); }
    }).catch((err) => { if (!controller.signal.aborted) { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, [from, count, revision]);
  useEffect(() => {
    if (!zone) return;
    const interval = window.setInterval(() => setToday(localDay(new Date().toISOString(), zone)), 60_000);
    return () => window.clearInterval(interval);
  }, [zone]);
  useEffect(() => { if (event) eventRef.current?.showModal(); }, [event]);
  useEffect(() => {
    const open = () => { setAddDate(selected || today); setAddError(''); addRef.current?.showModal(); };
    window.addEventListener('harbor:calendar-add', open);
    return () => window.removeEventListener('harbor:calendar-add', open);
  }, [selected, today]);

  const refresh = async () => { setRevision((n) => n + 1); };
  const filtered = (items: CalendarItem[]) => items.filter((item) => (kind === 'all' || item.kind === kind) && (!criticalOnly || item.critical));
  const forDay = (day: string) => data ? filtered(itemsOnDay(data, day, today)) : [];
  const currentItems = selected ? forDay(selected) : [];
  const allItems = days.flatMap(forDay);
  const unique = new Map(allItems.map((item) => [item.id, item]));
  const time = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: data?.timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const openItem = (item: CalendarItem) => item.task ? setEditing(item.task) : setEvent(item);
  async function move(task: AgendaTask, day: string) {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: day, time: '09:00', durationMin: task.durationMin }) });
      if (!res.ok) throw new Error('Could not reschedule the task.');
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not reschedule.'); } finally { setSaving(false); }
  }
  function drop(e: React.DragEvent, day: string) {
    e.preventDefault(); const id = e.dataTransfer.getData('text/task-id');
    const task = [...(data?.tasks || []), ...(data?.unscheduled || []), ...(data?.overdue || [])].find((t) => t.id === id);
    if (task) void move(task, day);
  }
  function rows(items: CalendarItem[]) { return <div className="cal-timeline">{items.map((item) => <button type="button" key={item.id} className={`cal-row ${item.overdue ? 'cal-overdue' : item.critical ? 'cal-critical' : ''}`} onClick={() => openItem(item)}><time>{item.allDay ? 'All day' : time(item.at)}</time><span className="cal-track"><i /></span><span className="cal-item-icon">{item.kind === 'event' ? <CalendarDays size={21} /> : item.critical || item.overdue ? <FileText size={21} /> : <CheckSquare size={21} />}</span><span className="cal-item-copy"><strong>{item.title}</strong><small>{item.deadlineOnly ? 'Deadline' : item.allDay ? 'Calendar' : `${item.duration} min · ${item.kind === 'event' ? 'Calendar' : 'Task'}`}</small>{(item.overdue || item.critical) && <b>{item.overdue ? 'Overdue' : 'Critical'}</b>}</span><ChevronRight size={17} /></button>)}</div>; }
  const filterButton = <button className="cal-icon-button" aria-label={`Filter calendar${kind !== 'all' || criticalOnly ? ', filters active' : ''}`} onClick={() => filterRef.current?.showModal()}><SlidersHorizontal size={20} />{(kind !== 'all' || criticalOnly) && <i className="cal-filter-dot" />}</button>;

  return <div className="calendar-screen"><header className="cal-title"><h1>Calendar</h1><button className="cal-icon-button" aria-label="Add a calendar task" onClick={() => window.dispatchEvent(new Event('harbor:calendar-add'))}><Plus size={22} /></button></header>
    <div className="cal-tabs" role="group" aria-label="Calendar view">{(['schedule', 'week', 'month'] as View[]).map((key) => <button key={key} aria-pressed={view === key} onClick={() => { setView(key); setExpanded({}); }}>{key[0].toUpperCase() + key.slice(1)}</button>)}</div>
    {view === 'schedule' ? <><ScheduleIntelligenceCard onChanged={() => void refresh()} /><div className="cal-toolbar"><h2>Upcoming</h2><select aria-label="Schedule range" value={range} onChange={(e) => setRange(Number(e.target.value))}>{[3, 5, 7, 14, 31].map((n) => <option key={n} value={n}>Next {n} days</option>)}</select>{filterButton}</div></> : selected && <><div className="cal-date-nav"><button className="cal-icon-button" aria-label={`Previous ${view}`} onClick={() => setSelected(view === 'week' ? shiftDay(selected, -7) : shiftMonth(selected, -1))}><ChevronLeft size={22} /></button><h2>{view === 'month' ? dateText(selected, { month: 'long', year: 'numeric' }) : `${dateText(days[0], { month: 'short', day: 'numeric' })} – ${dateText(days[6], { month: 'short', day: 'numeric' })}`}</h2><button className="cal-icon-button" aria-label={`Next ${view}`} onClick={() => setSelected(view === 'week' ? shiftDay(selected, 7) : shiftMonth(selected, 1))}><ChevronRight size={22} /></button><button className="cal-today" onClick={() => setSelected(today)}>Today</button></div><div className="cal-date-grid"><div className="cal-weekdays">{(view === 'week' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']).map((d) => <span key={d}>{d}</span>)}</div><div className="cal-cells">{days.map((day) => { const items = loading ? [] : forDay(day); return <button key={day} aria-pressed={selected === day} aria-current={day === today ? 'date' : undefined} aria-label={`${dateText(day, { weekday: 'long', month: 'long', day: 'numeric' })}${loading ? '' : `, ${items.length} items`}`} className={day.slice(0,7) !== selected.slice(0,7) && view === 'month' ? 'cal-outside' : ''} onClick={() => setSelected(day)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, day)}><span>{Number(day.slice(-2))}</span><div className="cal-dots">{items.some((i) => !i.critical && !i.overdue) && <i />}{items.some((i) => i.overdue) && <i className="amber" />}{items.some((i) => i.critical) && <i className="red" />}</div></button>; })}</div></div><p className="cal-legend">Blue: planned · Amber: overdue · Red: critical</p></>}
    {error && <p role="alert" className="cal-error">{error} <button onClick={() => void refresh()}>Try again</button></p>}
    {loading ? <p role="status" className="cal-empty">Loading your calendar…</p> : data && <>
      {(kind !== 'all' || criticalOnly) && <button className="cal-clear" onClick={() => { setKind('all'); setCriticalOnly(false); }}>Clear filters · {kind === 'all' ? 'All types' : kind === 'task' ? 'Tasks' : 'Appointments'}{criticalOnly ? ' · Critical only' : ''}</button>}
      {view !== 'month' && <div className="cal-summary"><Sparkles size={23} /><div><strong>{view === 'schedule' ? `${unique.size} items · ${[...unique.values()].filter((i) => i.deadline).length} deadlines` : `${currentItems.length ? 'Your' : 'A clear'} ${dateText(selected, { weekday: 'long' })}`}</strong><p>{view === 'schedule' ? `${data.overdue.length} overdue tasks overall · Includes today` : `${currentItems.length} items · ${currentItems.reduce((sum, i) => sum + (i.allDay ? 0 : i.duration), 0)} min planned`}</p></div></div>}
      {view === 'schedule' ? days.map((day, index) => { const items = forDay(day); return <section className="cal-day" key={day} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, day)}><header><h3>{index === 0 ? 'Today · ' : index === 1 ? 'Tomorrow · ' : ''}{dateText(day, { weekday: 'short', month: 'short', day: 'numeric' })}</h3><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></header>{items.length ? rows(expanded[day] ? items : items.slice(0,3)) : <p className="cal-day-empty">Nothing scheduled. Room to breathe.</p>}{items.length > 3 && <button className="cal-more" onClick={() => setExpanded((v) => ({ ...v, [day]: !v[day] }))}>{expanded[day] ? 'Show less' : `+${items.length - 3} more${index === 0 ? ' today' : ''}`}</button>}</section>; }) : <section className="cal-day" onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, selected)}><header><h3>{dateText(selected, { weekday: 'long', month: 'short', day: 'numeric' })}</h3><span>{currentItems.length} items</span>{filterButton}</header>{currentItems.length ? rows(currentItems) : <p className="cal-day-empty">Nothing scheduled for this day.</p>}</section>}
      <details className="cal-backlog"><summary>Unscheduled & overdue <span>{new Set([...data.unscheduled, ...data.overdue].map((t) => t.id)).size}</span></summary><p>Tap a task to choose its date and time. On desktop, drag it onto a day to schedule at 9 AM.</p>{Array.from(new Map([...data.overdue, ...data.unscheduled].map((t) => [t.id, t])).values()).map((task) => <button key={task.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)} onClick={() => setEditing(task)}>{task.title}<ChevronRight size={17} /></button>)}</details>
    </>}
    <dialog ref={filterRef} className="cal-dialog"><form method="dialog"><header><h2>Show on my calendar</h2><button aria-label="Close calendar filters"><X /></button></header><label>Item type<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">Tasks & appointments</option><option value="task">Tasks only</option><option value="event">Appointments only</option></select></label><label className="cal-checkbox"><input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} />Critical items only</label><button className="harbor-btn harbor-btn-brand">Show calendar</button></form></dialog>
    <dialog ref={eventRef} className="cal-dialog" onClose={() => setEvent(null)}><form method="dialog"><header><h2>Appointment</h2><button aria-label="Close appointment"><X /></button></header>{event && <><h3>{event.title}</h3><p>{new Date(event.originalStart || event.at).toLocaleString('en-US', { timeZone: data?.timeZone })} – {event.endAt && new Date(event.endAt).toLocaleString('en-US', { timeZone: data?.timeZone })}</p><p>{data?.timeZone}{event.allDay ? ' · All-day / continuing appointment' : ''}</p><p>Edit connected appointments in the source calendar.</p></>}</form></dialog>
    <dialog ref={addRef} className="cal-dialog"><form onSubmit={async (e) => { e.preventDefault(); if (saving) return; setSaving(true); setAddError(''); try { const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), date: addDate, time: addTime, durationMin: 30 }) }); if (!res.ok) throw new Error('Could not add this task.'); setTitle(''); addRef.current?.close(); await refresh(); } catch (err) { setAddError(err instanceof Error ? err.message : 'Could not save task.'); } finally { setSaving(false); } }}><header><h2>Add a calendar task</h2><button type="button" aria-label="Close new task" onClick={() => addRef.current?.close()}><X /></button></header><label>Task name<input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Date<input required type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} /></label><label>Time<input required type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)} /></label><p>30 minutes · {data?.timeZone}. Tap the task afterwards to add details.</p>{addError && <p role="alert">{addError}</p>}<button disabled={saving || !title.trim()} className="harbor-btn harbor-btn-brand">{saving ? 'Adding…' : 'Add task'}</button></form></dialog>
    {editing && data && <TaskDetailSheet key={editing.id} task={editing} timeZone={data.timeZone} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} onComplete={async () => { const res = await fetch(`/api/tasks/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) }); if (!res.ok) throw new Error('Could not complete task.'); setEditing(null); await refresh(); }} />}
  </div>;
}
