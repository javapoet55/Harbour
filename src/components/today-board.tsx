'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDay } from '@/lib/time';
import type { AgendaPayload } from '@/lib/types';
import { MobileDay } from './mobile-day';

export function TodayBoard() {
  const [data, setData] = useState<AgendaPayload | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const [editingTask, setEditingTask] = useState<AgendaPayload['tasks'][number] | null>(null);
  const [criticalFirst, setCriticalFirst] = useState(true);

  useEffect(() => {
    if (!focusRunning) return;
    const timer = window.setInterval(() => setFocusSeconds((seconds) => {
      if (seconds <= 1) { setFocusRunning(false); return 0; }
      return seconds - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning]);

  async function load() {
    const res = await fetch('/api/agenda?days=5');
    if (!res.ok) {
      setError('Could not load your day.');
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agenda?days=5')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((payload: AgendaPayload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your day.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const todayKey = data?.range.days[0];
  const timeZone = data?.timeZone;
  const dayOf = (iso: string | null) =>
    iso && timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '';
  const todayTasks = useMemo(() => {
    const inDay = (iso: string | null) =>
      iso && timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '';
    return data?.tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status) && (inDay(t.dueAt) === todayKey || inDay(t.startAt) === todayKey)) ?? [];
  }, [data, todayKey, timeZone]);
  const completedToday = useMemo(() => {
    const inDay = (iso: string | null | undefined) => iso && timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '';
    return data?.tasks.filter((task) => task.status === 'COMPLETED' && inDay(task.completedAt) === todayKey) ?? [];
  }, [data, todayKey, timeZone]);
  const displayedTodayTasks = useMemo(() => {
    if (!criticalFirst) return todayTasks;
    return [...todayTasks].sort((a, b) => Number(b.critical || b.priority === 'CRITICAL') - Number(a.critical || a.priority === 'CRITICAL'));
  }, [todayTasks, criticalFirst]);
  const todayEvents = useMemo(() => {
    const inDay = (iso: string | null) =>
      iso && timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '';
    return data?.events.filter((e) => inDay(e.startAt) === todayKey) ?? [];
  }, [data, todayKey, timeZone]);

  async function addTask(e?: React.FormEvent, mobileTitle?: string) {
    e?.preventDefault();
    const submittedTitle = (mobileTitle ?? title).trim();
    if (!submittedTitle || !todayKey || adding) return;
    setAdding(true);
    setError('');
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: submittedTitle, date: todayKey, time: `${parts.hour}:${parts.minute}`, status: 'PLANNED' }),
      });
      if (!res.ok) throw new Error('Could not add that task. Please try again.');
      setTitle('');
      await load();
    } catch (reason) {
      if (mobileTitle) throw reason;
      setError(reason instanceof Error ? reason.message : 'Could not add that task.');
    } finally {
      setAdding(false);
    }
  }

  async function complete(id: string) {
    const response = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) });
    if (!response.ok) { setError('Could not complete that task.'); return; }
    if (focusTaskId === id) { setFocusRunning(false); setFocusTaskId(null); setFocusSeconds(25 * 60); }
    await load();
  }

  async function restore(id: string) {
    const response = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PLANNED' }) });
    if (!response.ok) { setError('Could not restore that task.'); return; }
    await load();
  }

  function createdLabel(iso: string) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
    return `${parts.weekday}, ${parts.month} ${parts.day} ${parts.year}`;
  }

  function nextDayLabel(day: string) {
    const [year, month, date] = day.split('-').map(Number);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).formatToParts(new Date(Date.UTC(year, month - 1, date))).map((part) => [part.type, part.value]));
    return `${parts.weekday}, ${parts.month} ${parts.day} ${parts.year}`;
  }

  function toggleFocus(taskId: string) {
    if (focusTaskId !== taskId || focusSeconds === 0) { setFocusTaskId(taskId); setFocusSeconds(25 * 60); setFocusRunning(true); return; }
    setFocusRunning((running) => !running);
  }

  if (error) return <p className="text-[var(--danger)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading your day…</p>;

  const greetingHour = new Date().getHours();
  const hello = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-4 sm:space-y-5">
      <MobileDay data={data} tasks={displayedTodayTasks} completed={completedToday} weather={<Weather />} criticalFirst={criticalFirst} toggleSort={() => setCriticalFirst((value) => !value)} openTask={setEditingTask} complete={complete} restore={restore} add={(value) => addTask(undefined, value)} />
      <div className="hidden space-y-5 md:block">
      <header className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1"><p className="text-sm text-[var(--muted)]">{formatDay(new Date(), data.timeZone)}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{hello}.</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)] sm:text-base">Ask what is coming up, capture a task by voice, and Harbor will keep the reminders honest.</p></div>
        <Weather />
      </header>

      <form onSubmit={addTask} className="flex flex-col gap-2 sm:flex-row">
        <input className="harbor-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quick add a task" aria-label="Quick add task" />
        <button className="harbor-btn harbor-btn-brand" type="submit" disabled={adding || !title.trim()}>{adding ? 'Adding…' : 'Add task'}</button>
      </form>

      <section className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card title="Today’s calendar appointments">
          <List items={todayEvents.map((e) => e.title)} empty="No appointments today." />
        </Card>
        <Card title="Today’s to-do tasks" titleClassName="text-sm font-extrabold uppercase tracking-wide text-[#283c55]" action={<button type="button" onClick={() => setCriticalFirst((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-full border text-[#315b8a] transition ${criticalFirst ? 'border-[#7da9e8] bg-[#edf4fc]' : 'border-[var(--line)] bg-white'}`} aria-label={criticalFirst ? 'Critical-first sorting is on. Show schedule order' : 'Sort critical tasks first'} title={criticalFirst ? 'Critical tasks first' : 'Sort critical tasks first'}><SortIcon /></button>}>
          {displayedTodayTasks.length === 0 ? <p className="text-sm text-[var(--muted)]">No tasks due today.</p> : displayedTodayTasks.map((task) => {
            const isCritical = Boolean(task.critical || task.priority === 'CRITICAL');
            return <div key={task.id} className={`harbor-task-row flex items-start gap-3 border-b border-[var(--line)] px-2 py-3 last:border-0 ${isCritical ? 'rounded-xl bg-[#fff7f6]' : ''}`}>
              <button type="button" className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-2 border-[#d6a91f] bg-[#fffdf3] transition hover:bg-[#fff1a8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b8a]" onClick={() => void complete(task.id)} aria-label={`Complete ${task.title}`} title="Mark complete" />
              <div className="min-w-0 flex-1">
                <button type="button" className={`rounded text-left font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b8a] ${isCritical ? 'text-[#b42318]' : 'hover:text-[var(--brand)]'}`} onClick={() => setEditingTask(task)} aria-label={`Open details for ${task.title}`}>{task.title}</button>
                <p className={`mt-0.5 text-xs tracking-wide ${isCritical ? 'font-semibold text-[#b42318]' : 'text-[var(--faint)]'}`}><span className="uppercase">{isCritical ? 'CRITICAL' : task.priority} · {task.durationMin}m</span> · {createdLabel(task.createdAt)}</p>
              </div>
              <div className="flex w-28 shrink-0 justify-end">
                <button type="button" className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white text-[#315b8a] transition hover:bg-[#edf4fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b8a] ${focusTaskId === task.id ? 'w-28 px-3' : 'w-10'}`} onClick={() => toggleFocus(task.id)} aria-label={focusTaskId === task.id ? `${focusRunning ? 'Pause' : 'Resume'} focus timer, ${String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:${String(focusSeconds % 60).padStart(2, '0')} remaining` : `Start 25 minute focus timer for ${task.title}`} title={focusTaskId === task.id ? `${focusRunning ? 'Pause' : 'Resume'} focus timer` : 'Start 25 minute focus timer'}>{focusTaskId === task.id && !focusRunning ? <PlayIcon /> : focusTaskId === task.id ? <PauseIcon /> : <ClockIcon />}{focusTaskId === task.id ? <span className="font-mono text-sm font-semibold tabular-nums" aria-hidden="true">{String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:{String(focusSeconds % 60).padStart(2, '0')}</span> : null}</button>
              </div>
            </div>;
          })}
        </Card>
        <div className="lg:col-span-2"><Card title="Overdue">
          <List items={data.overdue.map((t) => t.title)} empty="Nothing overdue." />
        </Card></div>
        <Card title="Calendar preview">
          <List items={data.events.slice(0, 5).map((e) => e.title)} empty="No upcoming events." />
        </Card>
        <Card title="Next three days">
          <div className="space-y-3 text-sm">{data.range.days.slice(1, 4).map((day) => {
            const items = [
              ...data.events.filter((e) => dayOf(e.startAt) === day).map((e) => e.title),
              ...data.tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status) && (dayOf(t.dueAt) === day || dayOf(t.startAt) === day)).map((t) => t.title),
            ];
            return <div key={day}><p className="font-medium">{nextDayLabel(day)}</p>{items.length ? <ul className="ml-5 mt-1 list-disc space-y-1">{items.map((item, index) => <li key={`${day}-${item}-${index}`}>{item}</li>)}</ul> : <p className="mt-1 text-[var(--muted)]">Clear</p>}</div>;
          })}</div>
        </Card>
        <div className="lg:col-span-2"><Card title="Completed">
          {completedToday.length ? <ul className="space-y-1 text-sm">{completedToday.map((task) => <li key={task.id}><button type="button" onClick={() => void restore(task.id)} className="group flex min-h-8 w-full items-center gap-2 rounded-md px-1 text-left text-[var(--muted)] transition hover:bg-[#edf4fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b8a]" aria-label={`Restore ${task.title} to today's to-do list`} title="Restore to today's to-do list"><span aria-hidden="true" className="text-[var(--ok)]">✓</span><span className="line-through group-hover:no-underline">{task.title}</span></button></li>)}</ul> : <p className="text-sm text-[var(--muted)]">No tasks completed today.</p>}
        </Card></div>
      </section>
      </div>
      {editingTask ? <TaskDetailSheet task={editingTask} timeZone={data.timeZone} focusControl={<button type="button" className="harbor-btn w-full" onClick={() => toggleFocus(editingTask.id)}>{focusTaskId === editingTask.id ? `${focusRunning ? 'Pause' : 'Resume'} focus · ${String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:${String(focusSeconds % 60).padStart(2, '0')}` : 'Start a 25-minute focus session'}</button>} onClose={() => setEditingTask(null)} onSaved={async () => { setEditingTask(null); await load(); }} onComplete={async () => { await complete(editingTask.id); setEditingTask(null); }} /> : null}
    </div>
  );
}

function TaskDetailSheet({ task, timeZone, focusControl, onClose, onSaved, onComplete }: { task: AgendaPayload['tasks'][number]; timeZone: string; focusControl: React.ReactNode; onClose: () => void; onSaved: () => Promise<void>; onComplete: () => Promise<void> }) {
  const scheduledAt = task.startAt ?? task.dueAt;
  const localParts = scheduledAt ? Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(scheduledAt)).map((part) => [part.type, part.value])) : null;
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [duration, setDuration] = useState(task.durationMin);
  const [energy, setEnergy] = useState(task.energyLevel ?? 'MEDIUM');
  const [date, setDate] = useState(localParts ? `${localParts.year}-${localParts.month}-${localParts.day}` : '');
  const [time, setTime] = useState(localParts ? `${localParts.hour}:${localParts.minute}` : '09:00');
  const [recurrence, setRecurrence] = useState(task.recurrence?.frequency ?? 'NONE');
  const [critical, setCritical] = useState(Boolean(task.critical));
  const [subtasks, setSubtasks] = useState((task.subtasks ?? []).map((item) => item.title));
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [onClose]);

  function addSubtask() {
    const value = newSubtask.trim();
    if (!value) return;
    setSubtasks((items) => [...items, value]);
    setNewSubtask('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const details = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), notes, priority, durationMin: duration, energyLevel: energy, critical, subtasks, recurrence: recurrence === 'NONE' ? null : { frequency: recurrence, interval: 1 } }) });
      if (!details.ok) throw new Error('Could not save the task details.');
      if (date) {
        const schedule = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time, durationMin: duration }) });
        if (!schedule.ok) throw new Error('Details were saved, but the schedule could not be updated.');
      }
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the task.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#172033]/45 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-[#fffdf8] shadow-2xl sm:max-w-2xl sm:rounded-[28px]" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <form onSubmit={save}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[#fffdf8]/95 px-5 py-4 backdrop-blur sm:px-7">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Task details</p><h2 id="task-detail-title" className="text-xl font-semibold">Shape the work</h2></div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xl text-[var(--brand)]" aria-label="Close task details">×</button>
        </header>
        <div className="space-y-6 p-5 sm:p-7">
          {focusControl}
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--faint)]">Task</span><input autoFocus className="harbor-input text-lg font-semibold" value={title} onChange={(event) => setTitle(event.target.value)} /></label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DetailField label="Priority"><select className="harbor-input" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></DetailField>
            <DetailField label="Estimate"><select className="harbor-input" value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={15}>15 min</option><option value={25}>25 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hour</option><option value={90}>90 min</option><option value={120}>2 hours</option></select></DetailField>
            <DetailField label="Energy"><select className="harbor-input" value={energy} onChange={(event) => setEnergy(event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></DetailField>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--faint)]">Schedule</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><DetailField label="Date"><input type="date" className="harbor-input" value={date} onChange={(event) => setDate(event.target.value)} /></DetailField><DetailField label="Start time"><input type="time" className="harbor-input" value={time} onChange={(event) => setTime(event.target.value)} /></DetailField></div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailField label="Repeat"><select className="harbor-input" value={recurrence} onChange={(event) => setRecurrence(event.target.value)}><option value="NONE">Does not repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></DetailField>
            <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4"><input type="checkbox" className="h-5 w-5 accent-[#3d5a80]" checked={critical} onChange={(event) => setCritical(event.target.checked)} /><span><span className="block text-sm font-semibold">Important reminders</span><span className="text-xs text-[var(--muted)]">Use escalation channels</span></span></label>
          </div>

          <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--faint)]">Steps</p><div className="space-y-2">{subtasks.map((item, index) => <div key={`${item}-${index}`} className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2"><span className="h-4 w-4 rounded-full border border-[var(--faint)]" aria-hidden="true"/><span className="flex-1 text-sm">{item}</span><button type="button" onClick={() => setSubtasks((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="h-8 w-8 rounded-full text-[var(--muted)] hover:bg-[#f3eee5]" aria-label={`Remove subtask ${item}`}>×</button></div>)}</div><div className="mt-2 flex gap-2"><input className="harbor-input" value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubtask(); } }} placeholder="Add a step" aria-label="New subtask"/><button type="button" className="harbor-btn" onClick={addSubtask}>Add</button></div></div>

          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--faint)]">Notes</span><textarea className="min-h-28 w-full resize-y rounded-2xl border border-[var(--line)] bg-white p-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b8a]" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Context, links, or anything you need to remember…" /></label>
          {error ? <p className="text-sm text-[var(--danger)]" role="alert">{error}</p> : null}
        </div>
        <footer className="sticky bottom-0 flex gap-3 border-t border-[var(--line)] bg-[#fffdf8]/95 p-4 backdrop-blur sm:px-7"><button type="button" className="harbor-btn" onClick={() => void onComplete()}>Mark complete</button><button type="submit" className="harbor-btn harbor-btn-brand flex-1" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save changes'}</button></footer>
      </form>
    </section>
  </div>;
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--faint)]">{label}</span>{children}</label>; }

type WeatherData = { current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number }; units: { temperature_2m: string; wind_speed_10m: string } };

function Weather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [message, setMessage] = useState('Getting weather…');
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        // Static location for the current prototype: ZIP 94582 (San Ramon, CA).
        const response = await fetch('/api/weather?lat=37.7547&lon=-121.8997', { signal: controller.signal });
        if (!response.ok) throw new Error('weather');
        setWeather(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Weather is temporarily unavailable.');
      }
    })();
    return () => controller.abort();
  }, []);
  return <aside className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#7da9e8] bg-gradient-to-br from-[#e9f4ff] via-[#cfe5ff] to-[#94bff2] shadow-sm sm:h-14 sm:w-14" aria-live="polite" aria-label={weather ? `Weather for ZIP 94582: ${Math.round(weather.current.temperature_2m)} degrees Fahrenheit` : message} title="Weather for ZIP 94582">{weather ? <p className="text-base font-semibold text-[#163f6d] sm:text-lg">{Math.round(weather.current.temperature_2m)}°F</p> : <p className="px-1 text-center text-[8px] leading-tight text-[#295b91]">{message}</p>}</aside>;
}

function ClockIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function PauseIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>; }
function PlayIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="m8 5 11 7-11 7z"/></svg>; }
function SortIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h11M8 12h8M8 18h5M4 5v14M2 17l2 2 2-2"/></svg>; }

function Card({ title, children, action, titleClassName }: { title: string; children: React.ReactNode; action?: React.ReactNode; titleClassName?: string }) {
  return (
    <section className="harbor-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className={titleClassName ?? 'text-sm font-extrabold uppercase tracking-wide text-[#283c55]'}>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}
