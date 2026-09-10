'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, CalendarDays, CheckCircle2, CheckSquare, ChevronDown, Clock3, RefreshCw, Sparkles } from 'lucide-react';
import type { TodaySnapshotData } from '@/lib/schedule-intelligence';
import type { ExecutiveRecommendation } from '@/lib/executive-contract';
import { splitSectionItem } from '@/lib/assistant-sections';
import { useFocusSession } from './focus-session';
import './today-snapshot.css';

/** Refresh once for both responsive layouts, after edits and when returning to Nexdo. */
export function useTodaySnapshot(revision: unknown) {
  const [data, setData] = useState<TodaySnapshotData | null>(null);
  const [error, setError] = useState('');
  const [bufferMinutes, setBuffer] = useState(15);
  const [retry, setRetry] = useState(0);
  const [next, setNext] = useState<{ enabled: boolean; recommendation: ExecutiveRecommendation | null; contextActionId: string | null } | null>(null);
  const [nextError, setNextError] = useState('');
  const scheduleRevision = JSON.stringify(revision);

  useEffect(() => {
    if (!scheduleRevision || scheduleRevision === 'null') return;
    let disposed = false;
    let busy = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      if (busy) { again = true; return; }
      busy = true; clearTimeout(timer);
      try {
        const response = await fetch('/api/schedule-intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'next-action' }) });
        if (!response.ok) throw new Error('unavailable');
        const payload = await response.json();
        if (!disposed) {
          setNext(payload); setNextError('');
          if (payload.enabled && payload.refreshAt) timer = setTimeout(() => void refresh(), Math.min(2147483647, Math.max(1000, +new Date(payload.refreshAt) - Date.now() + 100)));
        }
      } catch { if (!disposed) { setNext(null); setNextError('Next-action suggestions are temporarily unavailable.'); } }
      finally { busy = false; if (again && !disposed) { again = false; void refresh(); } }
    };
    void refresh();
    window.addEventListener('harbor:focus-completed', refresh);
    window.addEventListener('harbor:tasks-updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener('harbor:focus-completed', refresh); window.removeEventListener('harbor:tasks-updated', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [scheduleRevision, retry]);

  const dismissNext = async () => {
    if (!next?.contextActionId) return;
    try {
      const response = await fetch('/api/schedule-intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'dismiss-next-action', contextActionId: next.contextActionId }) });
      if (!response.ok) throw new Error('unavailable');
      setNext((current) => current ? { ...current, recommendation: null } : current); setNextError('');
    } catch { setNextError('Could not dismiss this suggestion. Please retry.'); }
  };

  useEffect(() => {
    if (!revision) return;
    let request: AbortController | undefined;
    const refresh = async () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const res = await fetch(`/api/schedule-intelligence?scope=today&bufferMinutes=${bufferMinutes}`, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('Snapshot unavailable');
        const payload = await res.json();
        if (!payload.today || !Array.isArray(payload.today.attention) || !Array.isArray(payload.today.timeline)) throw new Error('Invalid snapshot');
        if (!controller.signal.aborted) { setData(payload.today); setError(''); }
      } catch {
        if (!controller.signal.aborted) { setData(null); setError('We couldn’t refresh your snapshot. Your tasks and calendar are still available below.'); }
      }
    };
    void refresh();
    return () => { request?.abort(); };
  }, [revision, bufferMinutes, retry]);

  return { data, error, next, nextError, dismissNext, bufferMinutes, onRetry: () => { setError(''); setRetry((value) => value + 1); }, onBufferChange: (value: number) => setBuffer(value) };
}

type Props = ReturnType<typeof useTodaySnapshot> & { onOpenTask: (id: string) => void };

export function TodaySnapshot({ data, error, next, nextError, dismissNext, onRetry, onOpenTask, bufferMinutes, onBufferChange }: Props) {
  const focus = useFocusSession();
  const [showAll, setShowAll] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const compactLines = (value: string) => splitSectionItem(value);
  if (error) return <section className="day-snapshot snapshot-unavailable" aria-label="Your day snapshot"><p role="status">{error}</p><button type="button" onClick={onRetry}><RefreshCw size={16} />Try again</button></section>;
  if (!data) return <section className="day-snapshot snapshot-loading" aria-label="Your day snapshot" aria-busy="true"><Sparkles size={20} /><p role="status">Bringing your day together…</p></section>;
  const time = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const hours = data.availableMinutes >= 60 ? `${Math.floor(data.availableMinutes / 60)}h${data.availableMinutes % 60 ? ` ${data.availableMinutes % 60}m` : ''}` : `${data.availableMinutes}m`;
  const remaining = data.timeline.filter((item) => !item.past);
  const items = showTimeline ? data.timeline : remaining.slice(0, 3);
  const issues = showAll ? data.attention : data.attention.slice(0, 2);
  const recommendation = data.recommendation;
  const best = next?.recommendation?.nextAction?.bestAction;
  const ask = (prompt: string, contextActionId?: string | null) => window.dispatchEvent(new CustomEvent('harbor:open-assistant', { detail: { prompt, contextActionId } }));
  const review = (kind: 'event' | 'task' | 'settings', taskId?: string) => taskId
    ? <button type="button" className="snapshot-link" onClick={() => onOpenTask(taskId)}>Review task<ArrowUpRight size={16} aria-hidden="true" /></button>
    : <Link className="snapshot-link" href={kind === 'settings' ? '/settings' : kind === 'task' ? '/tasks' : '/calendar'}>{kind === 'settings' ? 'Working hours' : kind === 'task' ? 'View tasks' : 'View calendar'}<ArrowUpRight size={16} aria-hidden="true" /></Link>;

  return <section className="day-snapshot" aria-label="Your day snapshot" aria-busy={data.bufferMinutes !== bufferMinutes}>
    <header className="snapshot-header">
      <div className="snapshot-eyebrow"><Sparkles size={17} aria-hidden="true" />Your day, in focus</div>
      <h2>{data.commitments} <span>{data.commitments === 1 ? 'commitment' : 'commitments'} today</span></h2>
      <p>{data.appointments} calendar {data.appointments === 1 ? 'appointment' : 'appointments'} · {data.tasks} open {data.tasks === 1 ? 'task' : 'tasks'}</p>
      <div className="snapshot-pulse">
        <span className={data.attention.length ? 'snapshot-attention-count' : 'snapshot-clear'}>{data.attention.length ? <AlertCircle size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}{data.attention.length ? `${data.attention.length} ${data.attention.length === 1 ? 'thing needs' : 'things need'} attention` : 'No conflicts detected'}</span>
        <span className="snapshot-capacity"><Clock3 size={15} aria-hidden="true" />{data.workingToday ? `${hours} free in work hours` : 'Non-working day'}</span>
      </div>
    </header>

    <div className="snapshot-body">
      <div className="snapshot-schedule">
        <div className="snapshot-section-title"><h3>{showTimeline ? 'All of today' : 'On your schedule'}</h3>{data.timeline.length > 0 && <button type="button" onClick={() => setShowTimeline((value) => !value)} aria-expanded={showTimeline}>{showTimeline ? 'Next up' : 'View day'}<ChevronDown size={14} aria-hidden="true" /></button>}</div>
        {items.length ? <ol className="snapshot-timeline">{items.map((item) => <li key={item.id} className={item.past ? 'snapshot-past' : ''}>
          <time dateTime={item.startAt}>{item.allDay ? 'All day' : time(item.startAt)}</time>
          <span className={`snapshot-timeline-icon ${item.kind}`} aria-hidden="true">{item.kind === 'event' ? <CalendarDays size={17} /> : <CheckSquare size={17} />}</span>
          <div>{item.kind === 'task' ? <button type="button" onClick={() => onOpenTask(item.sourceId)}>{item.title}</button> : <Link href="/calendar">{item.title}</Link>}<small>{item.deadlineOnly ? 'Task deadline' : item.kind === 'event' ? 'Calendar appointment' : 'Planned task'}{item.past ? ' · Earlier today' : ''}</small></div>
        </li>)}</ol> : <p className="snapshot-empty">{data.commitments ? 'No more appointments ahead. Take a look at your tasks below.' : 'Nothing scheduled today. A little room to choose what matters.'}</p>}
      </div>

      <div className="snapshot-guidance">
        {nextError && <p role="status">{nextError}</p>}
        {best ? (
          <article className="snapshot-recommendation" aria-label="What should I do next?">
            <span className="snapshot-eyebrow"><Sparkles size={16} aria-hidden="true" />What should I do next?</span>
            <h3>{best.title}</h3>
            <p>{best.focusMinutes} min recommended · {next!.recommendation!.window.availableMinutes} min available now</p>
            {compactLines(best.reasons.join(' · ')).map((line, index) => <p key={`snapshot-best-reason-${index}`}>{line}</p>)}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="harbor-btn harbor-btn-brand" disabled={focus.loading} onClick={() => void focus.start(best.taskId, best.title, best.focusMinutes, true)}>Start focus</button>
              <button type="button" className="harbor-btn" onClick={() => ask('Why?', next!.contextActionId)}>Why this?</button>
              <button type="button" className="harbor-btn" onClick={() => void dismissNext()}>Dismiss</button>
            </div>
            {focus.error && <p role="alert">{focus.error}</p>}
          </article>
        ) : (
          <div className="snapshot-recommendation">
            <button type="button" className="snapshot-link" onClick={() => ask('What should I do next?')}>What should I do next?<Sparkles size={16} aria-hidden="true" /></button>
            {next && !next.enabled && <p><Link href="/settings">Enable quiet next-action suggestions in Settings</Link></p>}
          </div>
        )}
        {issues.length > 0 && <div className="snapshot-issues" aria-label="Things needing attention">{issues.map((item) => <article key={item.id} className="snapshot-issue"><span className="snapshot-issue-label"><AlertCircle size={14} aria-hidden="true" />{item.label}</span><h3>{item.title}</h3><div>{compactLines(item.explanation).map((line, index) => <p key={`${item.id}-explanation-${index}`}>{line}</p>)}</div>{review(item.kind, item.taskId)}</article>)}{data.attention.length > 2 && <button type="button" className="snapshot-show-more" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>{showAll ? 'Show fewer' : `View all ${data.attention.length} attention items`}<ChevronDown size={15} aria-hidden="true" /></button>}</div>}
        {!best && <article className="snapshot-recommendation"><span className="snapshot-eyebrow"><Sparkles size={16} aria-hidden="true" />Plan ahead</span><h3>{recommendation.title}</h3>{compactLines(recommendation.explanation).map((line, index) => <p key={`snapshot-recommendation-${index}`}>{line}</p>)}{recommendation.additionalAdvice && compactLines(recommendation.additionalAdvice).map((line, index) => <p key={`snapshot-additional-${index}`}>{line}</p>)}{review(recommendation.kind, recommendation.taskId)}</article>}
      </div>
    </div>

    <footer className="snapshot-footer">
      <span>{data.bufferMinutes !== bufferMinutes ? 'Updating snapshot…' : `Tasks + visible calendars · Updated ${time(data.generatedAt)}`}</span>
      <details className="snapshot-assumptions"><summary>How this is calculated<ChevronDown size={14} aria-hidden="true" /></summary><div><p>Free time follows your working days and {data.workStart}–{data.workEnd} hours in {data.timeZone.replace(/_/g, ' ')}. It excludes scheduled tasks, appointments, and transition buffers. All-day appointments reserve working hours.</p><label>Buffer for this snapshot<select value={bufferMinutes} onChange={(event) => onBufferChange(Number(event.target.value))}>{[0, 15, 30, 45, 60].map((value) => <option value={value} key={value}>{value} minutes</option>)}</select></label><p>This is an assumed transition or travel buffer, not a route estimate. Suggestions use task duration estimates; no changes are made until you review and save them.</p></div></details>
    </footer>
  </section>;
}
