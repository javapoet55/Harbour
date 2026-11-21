'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlarmClock, ArrowRight, Bell, CalendarDays, CalendarPlus, CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, CircleCheck,
  Cloud, CloudRain, CloudSnow, CloudSun, PlayCircle, Search, Send, Sparkles, Sun, Target,
} from 'lucide-react';
import { scheduleFetch } from '@/lib/schedule-fetch';
import type { AgendaEvent, AgendaPayload, AgendaTask } from '@/lib/types';
import type { TodaySnapshotData } from '@/lib/schedule-intelligence';
import { standardContains } from '@/lib/task-query';
import type { Folder } from '@/lib/task-list';
import { TaskCreateSheet } from './task-create-sheet';
import './my-day-dashboard.css';

const OPEN = new Set(['INBOX', 'PLANNED', 'IN_PROGRESS', 'WAITING']);
const DAY_MS = 86_400_000;
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

type WeatherData = { current: { temperature_2m: number; weather_code?: number } };
type TimelineItem = { id: string; sourceId: string; kind: 'event' | 'task'; title: string; startAt: string; allDay: boolean; deadlineOnly: boolean; past: boolean };

/**
 * The desktop My Day dashboard. Everything on it comes from data the app already loads: the agenda
 * (tasks, events, overdue), the day snapshot (commitments and timeline), the task list (counts and
 * search), weather, and the assistant. Phone-width browsers keep the existing mobile layout.
 */
export function MyDayDashboard({ data, snapshot, completedToday, onOpenTask, onComplete, onReload, onStartFocus }: {
  data: AgendaPayload;
  snapshot: TodaySnapshotData | null;
  completedToday: number;
  onOpenTask: (task: AgendaTask) => void;
  onComplete: (id: string) => Promise<void>;
  onReload: () => Promise<void>;
  onStartFocus: (taskId: string, title: string) => void;
}) {
  const router = useRouter();
  const zone = data.timeZone;
  const today = data.range.days[0];
  const [firstName, setFirstName] = useState('');
  const [allTasks, setAllTasks] = useState<AgendaTask[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [creating, setCreating] = useState(false);
  const [ask, setAsk] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fullDay, setFullDay] = useState(false);
  const [notice, setNotice] = useState('');
  // The clock the page is drawn against. It moves on every minute and whenever the agenda reloads.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const dayOf = useCallback((iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : ''), [zone]);
  const timeOf = useCallback((iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)), [zone]);
  const minuteOf = useCallback((at: Date | string) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map((part) => [part.type, part.value]));
    return Number(parts.hour) * 60 + Number(parts.minute);
  }, [zone]);

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/tasks', { cache: 'no-store', signal });
      if (!response.ok) return;
      const payload = await response.json();
      if (!signal?.aborted && Array.isArray(payload.tasks)) setAllTasks(payload.tasks);
    } catch { /* The counts keep their last value; the lists come from the agenda. */ }
  }, []);

  // The counts follow the agenda: whenever it reloads (an edit, a refresh, coming back to the tab) they reload too.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTasks(controller.signal);
    return () => controller.abort();
  }, [data, loadTasks]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/me', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (!controller.signal.aborted && payload?.user?.name) setFirstName(String(payload.user.name).trim().split(/\s+/)[0] ?? ''); })
      .catch(() => { /* The greeting simply has no name. */ });
    fetch('/api/projects', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (!controller.signal.aborted && Array.isArray(payload?.projects)) setFolders(payload.projects); })
      .catch(() => { /* New tasks can still be created without a folder. */ });
    return () => controller.abort();
  }, []);

  const todayTasks = useMemo(() => data.tasks.filter((task) => OPEN.has(task.status) && (dayOf(task.startAt) === today || dayOf(task.dueAt) === today)), [data.tasks, dayOf, today]);
  const todayEvents = useMemo(() => data.events.filter((event) => dayOf(event.startAt) === today), [data.events, dayOf, today]);
  const overdue = data.overdue;

  const commitments = snapshot?.commitments ?? todayTasks.length + todayEvents.length;
  const appointments = snapshot?.appointments ?? todayEvents.length;
  const doneShare = completedToday + todayTasks.length > 0 ? completedToday / (completedToday + todayTasks.length) : 0;

  const stats = useMemo(() => {
    const tasks = allTasks ?? data.tasks;
    const weekAgo = now - 7 * DAY_MS;
    return {
      todo: tasks.filter((task) => task.status === 'INBOX' || task.status === 'PLANNED').length,
      inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
      completed: tasks.filter((task) => task.status === 'COMPLETED' && task.completedAt && Date.parse(task.completedAt) >= weekAgo).length,
    };
  }, [allTasks, data.tasks, now]);

  const priorities = useMemo(() => [...todayTasks]
    .sort((a, b) => (PRIORITY_RANK[a.critical ? 'CRITICAL' : a.priority] ?? 2) - (PRIORITY_RANK[b.critical ? 'CRITICAL' : b.priority] ?? 2) || Date.parse(a.startAt ?? a.dueAt ?? '') - Date.parse(b.startAt ?? b.dueAt ?? ''))
    .slice(0, 4), [todayTasks]);

  const timeline: TimelineItem[] = useMemo(() => {
    if (snapshot?.timeline) return snapshot.timeline;
    return [
      ...todayEvents.map((event) => ({ id: `event:${event.id}`, sourceId: event.id, kind: 'event' as const, title: event.title, startAt: event.startAt, allDay: Boolean(event.allDay), deadlineOnly: false, past: Date.parse(event.endAt ?? event.startAt) < now })),
      ...todayTasks.filter((task) => task.startAt ?? task.dueAt).map((task) => ({ id: `task:${task.id}`, sourceId: task.id, kind: 'task' as const, title: task.title, startAt: (task.startAt ?? task.dueAt)!, allDay: false, deadlineOnly: !task.startAt, past: Date.parse((task.startAt ?? task.dueAt)!) + task.durationMin * 60_000 < now })),
    ].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  }, [snapshot, todayEvents, todayTasks, now]);

  const findTask = (id: string) => [...data.tasks, ...data.overdue, ...data.unscheduled, ...(allTasks ?? [])].find((task) => task.id === id);
  const openTaskById = (id: string) => { const task = findTask(id); if (task) onOpenTask(task); else router.push('/tasks'); };
  const askNexdo = (prompt: string) => window.dispatchEvent(new CustomEvent('harbor:open-assistant', { detail: { prompt } }));

  async function complete(id: string) {
    if (busyId) return;
    setBusyId(id);
    try { await onComplete(id); } finally { setBusyId(null); }
  }

  const nowMinute = minuteOf(new Date(now));
  const hour = Math.floor(nowMinute / 60);
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLine = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(now));
  const focusTask = priorities[0] ?? overdue[0];

  return <div className="md-dash">
    <header className="md-hero">
      <div className="md-hero-copy">
        <p className="md-date">{dateLine}</p>
        <h1>{hello}{firstName ? `, ${firstName}` : ''}. <span aria-hidden="true">👋</span></h1>
        <p className="md-sub">Here’s your day at a glance. You have <strong>{plural(commitments, 'key commitment')}</strong> and <strong>{plural(overdue.length, 'overdue task')}</strong>.</p>
      </div>
      <div className="md-hero-tools">
        <DashboardSearch tasks={allTasks ?? data.tasks} events={data.events} timeOf={timeOf} dayOf={dayOf} onOpenTask={onOpenTask} />
        <Link href="/notifications" className="md-round" aria-label="Notifications"><Bell size={20} aria-hidden="true" /></Link>
        <WeatherChip />
      </div>
    </header>

    <div className="md-actions">
      <form className="md-ask" onSubmit={(event) => { event.preventDefault(); const prompt = ask.trim(); if (!prompt) return; askNexdo(prompt); setAsk(''); }}>
        <Sparkles size={22} aria-hidden="true" />
        <input value={ask} onChange={(event) => setAsk(event.target.value)} placeholder="Ask Nexdo to add a task, plan your day, or set a reminder…" aria-label="Ask Nexdo" autoComplete="off" />
        <button type="submit" aria-label="Send to Nexdo" disabled={!ask.trim()}><Send size={20} aria-hidden="true" /></button>
      </form>
      <button type="button" className="md-quick" onClick={() => router.push('/calendar?add=1')}><CalendarPlus size={24} aria-hidden="true" /><strong>Schedule</strong><span>an event</span></button>
      <button type="button" className="md-quick" onClick={() => setCreating(true)}><CheckCircle2 size={24} aria-hidden="true" /><strong>Add</strong><span>a task</span></button>
      <button type="button" className="md-quick" onClick={() => askNexdo('Plan my day')}><Sparkles size={24} aria-hidden="true" /><strong>Plan</strong><span>my day</span></button>
      <button type="button" className="md-quick" disabled={!focusTask} title={focusTask ? `Start a 25-minute focus session on “${focusTask.title}”` : 'Add a task for today to focus on'} onClick={() => focusTask && onStartFocus(focusTask.id, focusTask.title)}><Target size={24} aria-hidden="true" /><strong>Focus</strong><span>time</span></button>
    </div>
    {notice && <p role="status" className="md-notice">{notice}</p>}

    <div className="md-summary">
      <section className="md-focus" aria-label="Today’s focus">
        <svg className="md-ring" viewBox="0 0 80 80" role="img" aria-label={`${completedToday} of ${completedToday + todayTasks.length} tasks for today completed`}>
          <defs><linearGradient id="md-ring-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#22b8f0" /></linearGradient></defs>
          <circle cx="40" cy="40" r="32" fill="none" stroke="#e7e3fb" strokeWidth="8" />
          <circle cx="40" cy="40" r="32" fill="none" stroke="url(#md-ring-gradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${Math.max(doneShare, 0.04) * 201} 201`} transform="rotate(-90 40 40)" />
          <path d="m29 41 8 8 15-17" fill="none" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <p className="md-eyebrow">Today’s Focus</p>
          <h2>{plural(commitments, 'commitment')}</h2>
          <p className="md-focus-meta">{overdue.length} overdue <span aria-hidden="true">·</span> {plural(appointments, 'calendar event')}</p>
        </div>
      </section>
      <StatTile href="/tasks" icon={<AlarmClock size={26} aria-hidden="true" />} tone="red" value={overdue.length} label="Overdue" />
      <StatTile href="/tasks" icon={<CircleCheck size={26} aria-hidden="true" />} tone="blue" value={stats.todo} label="To Do" />
      <StatTile href="/tasks" icon={<PlayCircle size={26} aria-hidden="true" />} tone="indigo" value={stats.inProgress} label="In Progress" />
      <StatTile href="/tasks" icon={<CheckCircle2 size={26} aria-hidden="true" />} tone="green" value={stats.completed} label="Completed (7d)" />
    </div>

    <div className="md-columns">
      <section className="md-card md-schedule" aria-labelledby="md-schedule-title">
        <div className="md-card-head">
          <h2 id="md-schedule-title"><CalendarDays size={21} aria-hidden="true" />Today’s Schedule</h2>
          <button type="button" className="md-link" aria-pressed={fullDay} onClick={() => setFullDay((value) => !value)}>{fullDay ? 'Next up' : 'View Day'}<ChevronDown size={16} aria-hidden="true" style={fullDay ? { transform: 'rotate(180deg)' } : undefined} /></button>
        </div>
        <Schedule items={timeline} fullDay={fullDay} nowMinute={nowMinute} minuteOf={minuteOf} timeOf={timeOf} onOpenTask={openTaskById} />
      </section>

      <div className="md-stack">
        <section className="md-card" aria-labelledby="md-priorities-title">
          <div className="md-card-head"><h2 id="md-priorities-title"><Sparkles size={20} aria-hidden="true" />Priorities for Today</h2></div>
          {priorities.length ? <ul className="md-checks">{priorities.map((task) => {
            const level = task.critical ? 'CRITICAL' : task.priority;
            return <li key={task.id}>
              <button type="button" className="md-box" disabled={busyId !== null} aria-label={`Complete ${task.title}`} onClick={() => void complete(task.id)}>{busyId === task.id && <CheckSquare size={16} aria-hidden="true" />}</button>
              <button type="button" className="md-check-title" onClick={() => onOpenTask(task)}>{task.title}</button>
              {(level === 'HIGH' || level === 'CRITICAL') && <span className="md-badge">{level === 'HIGH' ? 'High' : 'Critical'}</span>}
            </li>;
          })}</ul> : <p className="md-empty">Nothing due today. Add a task or enjoy the room.</p>}
          <Link href="/tasks" className="md-link md-card-foot">View all tasks<ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <section className="md-card md-overdue" aria-labelledby="md-overdue-title">
          <div className="md-card-head">
            <h2 id="md-overdue-title"><AlarmClock size={21} aria-hidden="true" />Overdue ({overdue.length})</h2>
            {overdue.length > 0 && <Link href="/tasks" className="md-link">View all<ArrowRight size={16} aria-hidden="true" /></Link>}
          </div>
          {overdue.length ? <ul className="md-checks">{overdue.slice(0, 3).map((task) => <li key={task.id}>
            <button type="button" className="md-box" disabled={busyId !== null} aria-label={`Complete ${task.title}`} onClick={() => void complete(task.id)}>{busyId === task.id && <CheckSquare size={16} aria-hidden="true" />}</button>
            <button type="button" className="md-check-title" onClick={() => onOpenTask(task)}>{task.title}</button>
          </li>)}</ul> : <p className="md-empty">Nothing overdue.</p>}
          {overdue.length > 3 && <Link href="/tasks" className="md-more">+{overdue.length - 3} more</Link>}
        </section>
      </div>

      <div className="md-stack">
        <WeekStrip data={data} dayOf={dayOf} />
        <section className="md-card" aria-labelledby="md-upcoming-title">
          <div className="md-card-head"><h2 id="md-upcoming-title"><CalendarDays size={21} aria-hidden="true" />Upcoming <span>(Next 3 Days)</span></h2></div>
          <ul className="md-upcoming">{data.range.days.slice(1, 4).map((day) => {
            const tasks = data.tasks.filter((task) => OPEN.has(task.status) && (dayOf(task.startAt) === day || dayOf(task.dueAt) === day)).length;
            const events = data.events.filter((event) => dayOf(event.startAt) === day).length;
            const summary = [tasks ? plural(tasks, 'task') : '', events ? plural(events, 'event') : ''].filter(Boolean).join(' · ') || 'Clear';
            return <li key={day}><Link href="/calendar" aria-label={`${dayLabel(day)}: ${summary}. Opens the calendar`}><strong>{dayLabel(day)}</strong><span className={summary === 'Clear' ? '' : 'is-busy'}>{summary}</span><ChevronRight size={18} aria-hidden="true" /></Link></li>;
          })}</ul>
        </section>
      </div>
    </div>

    <section className="md-banner" aria-labelledby="md-banner-title">
      <div>
        <h2 id="md-banner-title">Plan ahead with Nexdo</h2>
        <p>Review overdue work, set your priorities, and line up your next steps.</p>
      </div>
      <button type="button" onClick={() => router.push('/planner')}><CalendarDays size={20} aria-hidden="true" />Plan My Next 3 Days</button>
    </section>

    {creating && <TaskCreateSheet timeZone={zone} tasks={allTasks ?? data.tasks} folders={folders} onClose={() => setCreating(false)}
      onCreated={(title) => { setCreating(false); setNotice(`Added “${title}”.`); window.setTimeout(() => setNotice(''), 6000); void onReload(); }} />}
  </div>;
}

function dayLabel(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(year, month - 1, date)));
}

function StatTile({ href, icon, tone, value, label }: { href: string; icon: React.ReactNode; tone: string; value: number; label: string }) {
  return <Link href={href} className="md-stat" data-tone={tone} aria-label={`${label}: ${value}. Opens tasks`}>{icon}<span><strong>{value}</strong><small>{label}</small></span></Link>;
}

/** Hour marks with the day's items placed between them. "Next up" starts an hour before now; "View Day" shows it all. */
function Schedule({ items, fullDay, nowMinute, minuteOf, timeOf, onOpenTask }: { items: TimelineItem[]; fullDay: boolean; nowMinute: number; minuteOf: (at: string) => number; timeOf: (iso: string) => string; onOpenTask: (id: string) => void }) {
  const allDay = items.filter((item) => item.allDay);
  const timed = items.filter((item) => !item.allDay).map((item) => ({ item, minute: minuteOf(item.startAt) }));
  const nowHour = Math.floor(nowMinute / 60);
  const first = timed.length ? Math.floor(timed[0].minute / 60) : nowHour;
  const last = timed.length ? Math.floor(timed[timed.length - 1].minute / 60) : nowHour;
  const from = fullDay ? Math.min(first, 8) : Math.max(0, nowHour - 1);
  const to = fullDay ? Math.max(last + 1, 20) : Math.min(24, Math.max(nowHour + 3, Math.min(last + 1, nowHour + 6)));
  const shown = timed.filter(({ minute }) => minute >= from * 60 && minute < (to + 1) * 60);
  const next = shown.find(({ item }) => !item.past)?.item.id;
  const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour % 24 < 12 ? 'AM' : 'PM'}`;
  const rows: Array<{ key: string; minute: number; item?: TimelineItem }> = [];
  for (let hour = from; hour <= Math.min(to, 23); hour++) rows.push({ key: `hour-${hour}`, minute: hour * 60 });
  for (const { item, minute } of shown) rows.push({ key: item.id, minute, item });
  rows.sort((a, b) => a.minute - b.minute || Number(Boolean(a.item)) - Number(Boolean(b.item)));
  // An item on the hour takes the place of that hour's mark.
  const visible = rows.filter((row, index) => row.item || rows[index + 1]?.minute !== row.minute || !rows[index + 1]?.item);
  const hidden = timed.length - shown.length;

  return <>
    {allDay.length > 0 && <ul className="md-allday">{allDay.map((item) => <li key={item.id}><span>All day</span>{item.kind === 'task' ? <button type="button" onClick={() => onOpenTask(item.sourceId)}>{item.title}</button> : <Link href="/calendar">{item.title}</Link>}</li>)}</ul>}
    <ol className="md-timeline">{visible.map((row) => row.item
      ? <li key={row.key} className={`md-slot ${row.item.id === next ? 'is-next' : ''} ${row.item.past ? 'is-past' : ''}`}>
          <time dateTime={row.item.startAt}>{timeOf(row.item.startAt)}</time>
          <span className="md-dot" aria-hidden="true" />
          {row.item.kind === 'task'
            ? <button type="button" className="md-entry" onClick={() => onOpenTask(row.item!.sourceId)}><span className="md-entry-icon" data-kind="task" aria-hidden="true"><CheckSquare size={18} /></span><span><strong>{row.item.title}</strong><small>{row.item.deadlineOnly ? 'Task deadline' : 'Planned task'}</small></span></button>
            : <Link href="/calendar" className="md-entry"><span className="md-entry-icon" data-kind="event" aria-hidden="true"><CalendarDays size={18} /></span><span><strong>{row.item.title}</strong><small>Calendar event</small></span></Link>}
        </li>
      : <li key={row.key} className="md-hour"><time>{hourLabel(row.minute / 60)}</time><span className="md-dot" aria-hidden="true" /></li>)}</ol>
    {!timed.length && !allDay.length && <p className="md-empty md-timeline-empty">Nothing scheduled today. A little room to choose what matters.</p>}
    {!fullDay && hidden > 0 && <p className="md-more">{plural(hidden, 'more item')} outside this window. Choose View Day to see everything.</p>}
  </>;
}

/** Seven days from today, with a dot for days that hold tasks and a dot for days that hold events. */
function WeekStrip({ data, dayOf }: { data: AgendaPayload; dayOf: (iso: string | null | undefined) => string }) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [other, setOther] = useState<AgendaPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const today = data.range.days[0];
  const start = useMemo(() => {
    const [year, month, date] = today.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, date + offset * 7)).toISOString().slice(0, 10);
  }, [today, offset]);

  useEffect(() => {
    if (offset === 0) return;
    const controller = new AbortController();
    scheduleFetch(`/api/agenda?days=7&from=${start}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('week'))))
      .then((payload: AgendaPayload) => { if (!controller.signal.aborted) { setOther(payload); setFailed(false); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [offset, start]);

  const week = offset === 0 ? data : other?.range.days[0] === start ? other : null;
  const days = Array.from({ length: 7 }, (_, index) => {
    const [year, month, date] = start.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, date + index)).toISOString().slice(0, 10);
  });
  const part = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`));
  const range = `${part(days[0], { month: 'short', day: 'numeric' })} – ${part(days[6], { month: 'short', day: 'numeric' })}, ${part(days[6], { year: 'numeric' })}`;

  return <section className="md-card md-week" aria-labelledby="md-week-title">
    <div className="md-card-head">
      <div><h2 id="md-week-title"><CalendarDays size={21} aria-hidden="true" />{offset === 0 ? 'This Week' : offset === 1 ? 'Next Week' : offset === -1 ? 'Last Week' : 'Week'}</h2><p>{range}</p></div>
      <div className="md-week-nav">
        <button type="button" aria-label="Previous week" onClick={() => setOffset((value) => value - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" aria-label="Next week" onClick={() => setOffset((value) => value + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </div>
    <ol className="md-days" aria-busy={!week && !failed}>{days.map((day) => {
      const tasks = week ? week.tasks.filter((task) => OPEN.has(task.status) && (dayOf(task.startAt) === day || dayOf(task.dueAt) === day)).length : 0;
      const events = week ? week.events.filter((event) => dayOf(event.startAt) === day).length : 0;
      return <li key={day}><button type="button" className={day === today ? 'is-today' : ''} aria-current={day === today ? 'date' : undefined} aria-label={`${part(day, { weekday: 'long', month: 'long', day: 'numeric' })}: ${plural(tasks, 'task')}, ${plural(events, 'event')}. Opens the calendar`} onClick={() => router.push('/calendar')}>
        <span>{part(day, { weekday: 'short' })}</span><strong>{part(day, { day: 'numeric' })}</strong>
        <i aria-hidden="true">{tasks > 0 && <b data-kind="task" />}{events > 0 && <b data-kind="event" />}</i>
      </button></li>;
    })}</ol>
    {failed && offset !== 0 && <p className="md-empty">Couldn’t load that week. <button type="button" className="md-link" onClick={() => setOffset(0)}>Back to this week</button></p>}
  </section>;
}

/** Looks through the tasks and the next week's events already in the browser. ⌘K or Ctrl+K focuses it. */
function DashboardSearch({ tasks, events, timeOf, dayOf, onOpenTask }: { tasks: AgendaTask[]; events: AgendaEvent[]; timeOf: (iso: string) => string; dayOf: (iso: string | null | undefined) => string; onOpenTask: (task: AgendaTask) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const query = term.trim();

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); setOpen(true); } };
    const away = (event: MouseEvent) => { if (!(event.target instanceof Node && box.current?.contains(event.target))) setOpen(false); };
    window.addEventListener('keydown', key);
    document.addEventListener('mousedown', away);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', away); };
  }, []);

  const results = useMemo(() => {
    if (query.length < 2) return { tasks: [], events: [] };
    return {
      tasks: tasks.filter((task) => task.status !== 'CANCELLED' && (standardContains(task.title, query) || (task.notes ? standardContains(task.notes, query) : false)))
        .sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED')).slice(0, 6),
      events: events.filter((event) => standardContains(event.title, query)).slice(0, 4),
    };
  }, [query, tasks, events]);
  const none = query.length >= 2 && !results.tasks.length && !results.events.length;

  return <div className="md-search" ref={box}>
    <Search size={18} aria-hidden="true" />
    <input ref={input} type="search" value={term} placeholder="Search tasks, notes, or events… (⌘K)" aria-label="Search tasks, notes, or events" autoComplete="off" role="combobox" aria-expanded={open && query.length >= 2} aria-controls="md-search-results"
      onChange={(event) => { setTerm(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); input.current?.blur(); } }} />
    {open && query.length >= 2 && <div className="md-search-results" id="md-search-results" role="listbox" aria-label="Search results">
      {results.tasks.map((task) => <button key={task.id} type="button" role="option" aria-selected="false" onClick={() => { setOpen(false); onOpenTask(task); }}><CheckSquare size={17} aria-hidden="true" /><span><strong>{task.title}</strong><small>{task.status === 'COMPLETED' ? 'Completed task' : task.startAt ?? task.dueAt ? `Task · ${dayLabel(dayOf(task.startAt ?? task.dueAt))}` : 'Task · Unscheduled'}</small></span></button>)}
      {results.events.map((event) => <button key={event.id} type="button" role="option" aria-selected="false" onClick={() => { setOpen(false); router.push('/calendar'); }}><CalendarDays size={17} aria-hidden="true" /><span><strong>{event.title}</strong><small>Event · {dayLabel(dayOf(event.startAt))}{event.allDay ? '' : `, ${timeOf(event.startAt)}`}</small></span></button>)}
      {none && <p>No tasks or events match “{query}”.</p>}
    </div>}
  </div>;
}

function WeatherChip() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // The same fixed location the rest of the web app uses today (ZIP 94582, San Ramon, CA).
    scheduleFetch('/api/weather?lat=37.7547&lon=-121.8997', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (!controller.signal.aborted && payload?.current) setWeather(payload); })
      .catch(() => { /* The chip stays hidden when weather is unavailable. */ });
    return () => controller.abort();
  }, []);
  if (!weather) return null;
  const code = Number(weather.current.weather_code ?? 0);
  const Icon = code === 0 ? Sun : code <= 2 ? CloudSun : code <= 48 ? Cloud : code >= 71 && code <= 77 || code === 85 || code === 86 ? CloudSnow : CloudRain;
  const degrees = Math.round(weather.current.temperature_2m);
  return <p className="md-weather" aria-label={`Weather for ZIP 94582: ${degrees} degrees Fahrenheit`} title="Weather for ZIP 94582"><Icon size={22} aria-hidden="true" />{degrees}°F</p>;
}
