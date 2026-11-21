'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlarmClock, CalendarClock, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { scheduleFetch } from '@/lib/schedule-fetch';
import type { AgendaPayload } from '@/lib/types';
import {
  canReschedule, focusLabel, overdueTasks, rescheduleButtonTitle, rescheduleFailure, rescheduleSlots, shiftWeek, weekdayInitial, weekRange, zonedParts,
  type WeeklySummary,
} from '@/lib/daily-plan';
import './daily-plan.css';

const toLocalInput = (ms: number, timeZone: string) => { const { date, time } = zonedParts(ms, timeZone); return `${date}T${time}`; };

/**
 * "Reschedule overdue": every overdue task is placed one after another from a start time, each taking its
 * estimate, through the normal task save (so a schedule conflict is asked about as it is everywhere). The
 * run stops at the first failure; earlier moves stay saved.
 */
function RescheduleDialog({ tasks, timeZone, onClose, onDone }: { tasks: AgendaPayload['overdue']; timeZone: string; onClose: () => void; onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [start, setStart] = useState(() => toLocalInput(Date.now() + 3_600_000, timeZone));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [moved, setMoved] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); opener?.focus(); };
  }, []);

  // The field holds a wall-clock time in the account's zone; find the instant it names.
  const startMs = useMemo(() => {
    const [date, time] = start.split('T');
    if (!date || !time) return NaN;
    const guess = Date.parse(`${date}T${time}:00Z`);
    if (Number.isNaN(guess)) return NaN;
    let ms = guess;
    for (let i = 0; i < 3; i += 1) {
      const shown = zonedParts(ms, timeZone);
      const diff = Date.parse(`${shown.date}T${shown.time}:00Z`) - guess;
      if (diff === 0) break;
      ms -= diff;
    }
    return ms;
  }, [start, timeZone]);

  const ok = canReschedule({ saving, count: tasks.length, start: startMs, now });

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!ok) return;
    setSaving(true);
    setError('');
    setMoved(0);
    let count = 0;
    for (const { task, startMs: slotStart } of rescheduleSlots(tasks, startMs)) {
      const { date, time } = zonedParts(slotStart, timeZone);
      try {
        const response = await scheduleFetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time }) });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.error === 'string' ? body.error : 'The time was not saved.');
        }
        count += 1;
        setMoved(count);
      } catch (reason) {
        setError(rescheduleFailure(task.title, reason instanceof Error ? reason.message : 'The time was not saved.'));
        setSaving(false);
        if (count > 0) onDone();
        return;
      }
    }
    setSaving(false);
    onDone();
    onClose();
  }

  return <dialog ref={dialog} className="dp-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={run} aria-busy={saving}>
      <h2 id={titleId}>Reschedule overdue</h2>
      <p>Moves {tasks.length} overdue task{tasks.length === 1 ? '' : 's'} one after another, each for its estimated time.</p>
      <label className="dp-field">Start at
        <input type="datetime-local" className="harbor-input" required value={start} disabled={saving} onChange={(event) => setStart(event.target.value)} />
      </label>
      <p className="dp-hint">Times are in your account time zone ({timeZone}).</p>
      {startMs <= now && !saving && <p className="dp-hint" role="status">Choose a start time in the future.</p>}
      {saving && <p className="dp-hint" role="status">Moved {moved} of {tasks.length}…</p>}
      {error && <p role="alert" className="dp-error">{error}</p>}
      <div className="dp-actions">
        <button type="button" className="harbor-btn" disabled={saving} onClick={onClose}>{moved > 0 && error ? 'Close' : 'Cancel'}</button>
        <button type="submit" className="harbor-btn harbor-btn-brand" disabled={!ok}>{rescheduleButtonTitle(saving, tasks.length)}</button>
      </div>
    </form>
  </dialog>;
}

function WeeklySummaryCard() {
  const [week, setWeek] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState<string | null>(null);
  const [data, setData] = useState<WeeklySummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (start: string | null, signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/weekly-summary${start ? `?start=${encodeURIComponent(start)}` : ''}`, { cache: 'no-store', signal });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.error === 'string' ? body.error : 'The weekly summary could not be loaded.');
      }
      const summary = (await response.json()) as WeeklySummary;
      setData(summary);
      setWeek(summary.start);
      setCurrentWeek((current) => current ?? (start === null ? summary.start : current));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'The weekly summary could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(null, controller.signal));
    return () => controller.abort();
  }, [load]);

  const isCurrent = currentWeek !== null && week === currentWeek;
  const busiest = Math.max(1, ...(data?.days.map((day) => Math.max(day.planned, day.completed)) ?? [1]));

  return <section className="harbor-card dp-card" aria-labelledby="dp-week-title">
    <div className="dp-head">
      <h2 id="dp-week-title"><Sparkles size={20} aria-hidden="true" /> Weekly summary</h2>
      {data && <div className="dp-pager">
        <button type="button" className="dp-icon" aria-label="Previous week" disabled={loading || !week} onClick={() => week && void load(shiftWeek(week, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>
        <span>{isCurrent ? 'This week' : weekRange(data.start, data.end)}</span>
        <button type="button" className="dp-icon" aria-label="Next week" disabled={loading || isCurrent || !week} onClick={() => week && void load(shiftWeek(week, 1))}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>}
    </div>
    {error && <p role="alert" className="dp-error">{error} <button type="button" className="underline" onClick={() => void load(week)}>Try again</button></p>}
    {!data && loading && <p className="dp-hint" role="status">Loading your week…</p>}
    {data && <div aria-busy={loading}>
      <p className="dp-headline">{data.headline}</p>
      <p className="dp-hint">{data.summary}</p>
      <dl className="dp-metrics">
        <div><dt>Completed</dt><dd>{data.metrics.completed}<small> of {data.metrics.planned}</small></dd></div>
        <div><dt>Completion</dt><dd>{data.metrics.completionRate === null ? '—' : `${data.metrics.completionRate}%`}</dd></div>
        <div><dt>Overdue</dt><dd>{data.metrics.overdue}</dd></div>
        <div><dt>Focus</dt><dd>{focusLabel(data.metrics.focusMinutes)}</dd></div>
      </dl>
      <ul className="dp-days" aria-label="Planned and completed tasks by day">
        {data.days.map((day) => <li key={day.date} aria-label={`${weekdayInitial(day.date)}: ${day.completed} of ${day.planned} completed`}>
          <span className="dp-bar" aria-hidden="true"><i style={{ height: `${(day.planned / busiest) * 100}%` }}><b style={{ height: day.planned === 0 ? 0 : `${(day.completed / day.planned) * 100}%` }} /></i></span>
          <small aria-hidden="true">{weekdayInitial(day.date)}</small>
        </li>)}
      </ul>
      {data.accomplishments.length > 0 && <div className="dp-wins"><p>Top accomplishments</p><ol>{data.accomplishments.map((item) => <li key={item.id}>{item.title}</li>)}</ol></div>}
      <p className="dp-foot">{data.limitations[0]}</p>
    </div>}
  </section>;
}

/** The daily plan under My Day: what is overdue (with one-step rescheduling) and the weekly summary. */
export function DailyPlan({ data, onChanged }: { data: AgendaPayload; onChanged: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const overdue = useMemo(() => overdueTasks(data.overdue, now), [data.overdue, now]);

  return <div className="dp-wrap">
    <section className="harbor-card dp-card" aria-labelledby="dp-overdue-title">
      <div className="dp-head">
        <h2 id="dp-overdue-title"><AlarmClock size={20} aria-hidden="true" /> Needs attention</h2>
        {overdue.length > 0 && <button type="button" className="harbor-btn harbor-btn-brand" onClick={() => setOpen(true)}><CalendarClock size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Reschedule overdue</button>}
      </div>
      {overdue.length === 0 ? <p className="dp-hint">Nothing is overdue. You’re on track.</p> : <>
        <p className="dp-hint">{overdue.length} task{overdue.length === 1 ? ' is' : 's are'} past {overdue.length === 1 ? 'its' : 'their'} time.</p>
        <ul className="dp-list">
          {overdue.slice(0, 6).map((task) => <li key={task.id}><span>{task.title}</span><small>{new Intl.DateTimeFormat(undefined, { timeZone: data.timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date((task.startAt ?? task.dueAt)!))}</small></li>)}
        </ul>
        {overdue.length > 6 && <p className="dp-hint">and {overdue.length - 6} more</p>}
      </>}
    </section>
    <WeeklySummaryCard />
    {open && <RescheduleDialog tasks={overdue} timeZone={data.timeZone} onClose={() => setOpen(false)} onDone={() => { window.dispatchEvent(new Event('harbor:tasks-updated')); void onChanged(); }} />}
  </div>;
}
