'use client';
import {TaskAgentCard} from './task-agent-card';
import { scheduleFetch } from '@/lib/schedule-fetch';

import { useEffect, useMemo, useState } from 'react';
import type { AgendaPayload } from '@/lib/types';
import { MobileDay } from './mobile-day';
import { MyDayDashboard } from './my-day-dashboard';
import { TodaySnapshot, useTodaySnapshot } from './today-snapshot';
import { useRouter } from 'next/navigation';
import { useFocusSession, FocusSessionControl } from './focus-session';
import { FolderSelect } from './folder-select';
import { lifeReminderLabel, type Folder } from '@/lib/task-list';

export function TodayBoard() {
  const [data, setData] = useState<AgendaPayload | null>(null);
  const router = useRouter();
  const snapshot = useTodaySnapshot(data);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const focus = useFocusSession();
  const focusTaskId = focus.session?.taskId;
  const focusSeconds = focus.seconds;
  const focusRunning = Boolean(focus.session?.endsAt && focusSeconds > 0);
  const [editingTask, setEditingTask] = useState<AgendaPayload['tasks'][number] | null>(null);
  const [criticalFirst, setCriticalFirst] = useState(true);

  async function load() {
    const res = await scheduleFetch('/api/agenda?days=7');
    if (!res.ok) {
      setError('Could not load your day.');
      return;
    }
    setData(await res.json());
  }

  function openSnapshotTask(id: string) {
    const task = [...(data?.tasks ?? []), ...(data?.overdue ?? []), ...(data?.unscheduled ?? [])].find((item) => item.id === id);
    if (task) setEditingTask(task);
    else router.push('/tasks');
  }

  useEffect(() => {
    let request: AbortController | undefined;
    const refresh = () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      scheduleFetch('/api/agenda?days=7', { signal: controller.signal, cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
        .then((payload: AgendaPayload) => { if (!controller.signal.aborted) { setData(payload); setError(''); } })
        .catch(() => { if (!controller.signal.aborted) setError('Could not load your day.'); });
    };
    const resume = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    const interval = window.setInterval(resume, 60_000);
    window.addEventListener('focus', resume);
    window.addEventListener('harbor:tasks-updated', refresh);
    document.addEventListener('visibilitychange', resume);
    return () => {
      request?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', resume);
      window.removeEventListener('harbor:tasks-updated', refresh);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  const todayKey = data?.range.days[0];
  const timeZone = data?.timeZone;
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
  async function addTask(e?: React.FormEvent, mobileTitle?: string) {
    e?.preventDefault();
    const submittedTitle = (mobileTitle ?? title).trim();
    if (!submittedTitle || !todayKey || adding) return;
    setAdding(true);
    setError('');
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
      const res = await scheduleFetch('/api/tasks', {
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
    const response = await scheduleFetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) });
    if (!response.ok) { setError('Could not complete that task.'); return; }
    if (focusTaskId === id) focus.stop();
    await load();
  }

  async function restore(id: string) {
    const response = await scheduleFetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PLANNED' }) });
    if (!response.ok) { setError('Could not restore that task.'); return; }
    await load();
  }

  function toggleFocus(taskId: string) {
    if (focusTaskId !== taskId || focusSeconds === 0) { void focus.start(taskId, data?.tasks.find((task) => task.id === taskId)?.title ?? 'Focus'); return; }
    focus.toggle();
  }

  if (error && !data) return <p role="alert" className="text-[var(--danger)]">{error} <button type="button" className="underline" onClick={() => void load().catch(() => setError('Could not load your day.'))}>Try again</button></p>;
  if (!data) return <p className="text-[var(--muted)]">Loading your day…</p>;

  return (
    <div className="space-y-4 sm:space-y-5">
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error} Showing your last loaded tasks.</p>}
      <MobileDay data={data} tasks={displayedTodayTasks} completed={completedToday} weather={<Weather />} snapshot={<TodaySnapshot {...snapshot} onOpenTask={openSnapshotTask} />} criticalFirst={criticalFirst} toggleSort={() => setCriticalFirst((value) => !value)} openTask={setEditingTask} complete={complete} restore={restore} add={(value) => addTask(undefined, value)} />
      <div className="hidden md:block">
        <MyDayDashboard data={data} snapshot={snapshot.data} completedToday={completedToday.length} onOpenTask={setEditingTask} onComplete={complete} onReload={load}
          onStartFocus={(taskId, taskTitle) => { if (focusTaskId !== taskId || focusSeconds === 0) void focus.start(taskId, taskTitle); }} />
      </div>
      {editingTask ? <TaskDetailSheet task={editingTask} timeZone={data.timeZone} focusControl={<button type="button" className="harbor-btn w-full" onClick={() => toggleFocus(editingTask.id)}>{focusTaskId === editingTask.id ? `${focusRunning ? 'Pause' : 'Resume'} focus · ${String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:${String(focusSeconds % 60).padStart(2, '0')}` : 'Start a 25-minute focus session'}</button>} onClose={() => setEditingTask(null)} onSaved={async () => { setEditingTask(null); await load(); }} onComplete={async () => { await complete(editingTask.id); setEditingTask(null); }} /> : null}
    </div>
  );
}

export function TaskDetailSheet({ task, timeZone, focusControl, folders, onClose, onSaved, onComplete, onReopen }: { task: AgendaPayload['tasks'][number]; timeZone: string; focusControl?: React.ReactNode; folders?: Folder[]; onClose: () => void; onSaved: () => Promise<void>; onComplete: () => Promise<void>; onReopen?: () => Promise<void> }) {
  const scheduledAt = task.startAt ?? task.dueAt;
  const localParts = scheduledAt ? Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(scheduledAt)).map((part) => [part.type, part.value])) : null;
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [duration, setDuration] = useState(task.durationMin);
  const [energy, setEnergy] = useState(task.energyLevel ?? 'MEDIUM');
  const [splittable, setSplittable] = useState(task.splittable ?? false);
  const [minFocusMin, setMinFocusMin] = useState(task.minFocusMin ?? 15);
  const initialDate = localParts ? `${localParts.year}-${localParts.month}-${localParts.day}` : '';
  const initialTime = localParts ? `${localParts.hour}:${localParts.minute}` : '09:00';
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [recurrence, setRecurrence] = useState(task.recurrence?.frequency ?? 'NONE');
  const [critical, setCritical] = useState(Boolean(task.critical));
  const [subtasks, setSubtasks] = useState((task.subtasks ?? []).map((item) => item.title));
  // The folder is editable only when the payload says which folder the task is in.
  const originalFolder = task.projectId === undefined ? undefined : task.projectId ?? null;
  const [folderId, setFolderId] = useState<string | null>(originalFolder ?? null);
  const reminderLabel = lifeReminderLabel(task.lifeReminderType);
  const done = task.status === 'COMPLETED';
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
      const details = await scheduleFetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), notes, priority, durationMin: duration, energyLevel: energy, splittable, minFocusMin, critical, subtasks, recurrence: recurrence === 'NONE' ? null : { frequency: recurrence, interval: 1 }, ...(originalFolder !== undefined && folderId !== originalFolder ? { projectId: folderId } : {}) }) });
      if (!details.ok) throw new Error('Could not save the task details.');
      // Reschedule only when the date, time or estimate changed, so an untouched schedule is never re-checked.
      if (date && (date !== initialDate || time !== initialTime || duration !== task.durationMin)) {
        const schedule = await scheduleFetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time, durationMin: duration }) });
        if (!schedule.ok) throw new Error('Details were saved, but the schedule could not be updated.');
      }
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the task.');
    } finally {
      setSaving(false);
    }
  }

  async function markComplete() {
    if (saving || (done && !onReopen)) return;
    setSaving(true);
    setError('');
    try { if (done) await onReopen?.(); else await onComplete(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : done ? 'Could not reopen the task.' : 'Could not complete the task.'); }
    finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#172033]/45 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-[#fffdf8] shadow-2xl sm:max-w-2xl sm:rounded-[28px]" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <TaskAgentCard taskId={task.id}/>
      <form onSubmit={save}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[#fffdf8]/95 px-5 py-4 backdrop-blur sm:px-7">
          <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Task details</p>{reminderLabel && <p className="mt-1 text-xs font-semibold text-[#c2109f]"><span aria-hidden="true">✦ </span><span className="sr-only">Smart reminder: </span>{reminderLabel}</p>}<h2 id="task-detail-title" className="line-clamp-2 text-xl font-semibold [overflow-wrap:anywhere]">{title.trim() || task.title}</h2></div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xl text-[var(--brand)]" aria-label="Close task details">×</button>
        </header>
        <div className="space-y-6 p-5 sm:p-7">
          {focusControl ?? <FocusSessionControl taskId={task.id} title={task.title} />}
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--faint)]">Task</span><input autoFocus className="harbor-input text-lg font-semibold" value={title} onChange={(event) => setTitle(event.target.value)} /></label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DetailField label="Priority"><select className="harbor-input" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></DetailField>
            <DetailField label="Estimate"><select className="harbor-input" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{[...new Set([15, 25, 30, 45, 60, 90, 120, duration])].sort((a, b) => a - b).map((minutes) => <option key={minutes} value={minutes}>{minutes === 60 ? '1 hour' : minutes === 120 ? '2 hours' : `${minutes} min`}</option>)}</select></DetailField>
            <DetailField label="Energy"><select className="harbor-input" value={energy} onChange={(event) => setEnergy(event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></DetailField>
          </div>

          {originalFolder !== undefined && <DetailField label="Folder"><FolderSelect className="harbor-input" value={folderId} onChange={setFolderId} folders={folders} /></DetailField>}

          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <label className="flex items-center gap-3"><input type="checkbox" checked={splittable} onChange={(event) => setSplittable(event.target.checked)} /><span>Can make progress in shorter sessions</span></label>
            {splittable && <label className="mt-3 block text-sm">Smallest useful session<select className="harbor-input mt-1" value={minFocusMin} onChange={(event) => setMinFocusMin(Number(event.target.value))}>{[5, 10, 15, 25, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>}
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
        <footer className="sticky bottom-0 flex gap-3 border-t border-[var(--line)] bg-[#fffdf8]/95 p-4 backdrop-blur sm:px-7"><button type="button" className="harbor-btn" disabled={saving || (done && !onReopen)} onClick={() => void markComplete()}>{done ? (onReopen ? 'Mark incomplete' : 'Done') : 'Mark complete'}</button><button type="submit" className="harbor-btn harbor-btn-brand flex-1" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save changes'}</button></footer>
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
        const response = await scheduleFetch('/api/weather?lat=37.7547&lon=-121.8997', { signal: controller.signal });
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
