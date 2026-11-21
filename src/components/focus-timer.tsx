'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, History, Pause, Play, Settings2, SkipForward, Square, Timer, X } from 'lucide-react';
import {
  isActive, newPomodoroSession, POMODORO_CATEGORIES, POMODORO_CATEGORY_TITLES, progress, remaining, stop, tick, togglePause,
  type PomodoroCategory, type PomodoroSession,
} from '@/lib/pomodoro';
import { focusedSeconds, POMODORO_PERIOD_TITLES, POMODORO_PERIODS, pomodoroAnalytics, type PomodoroPeriod } from '@/lib/pomodoro-analytics';

/**
 * The Pomodoro timer from the phone apps, on the web. As on the phones the timer runs in the browser and
 * the server keeps the history: every change raises the session's revision and is sent with
 * `PUT /api/pomodoro`; `GET /api/pomodoro` brings back sessions started on other devices. The cache uses
 * the phones' key (`nexdo.pomodoro.v1.<account>`), so a session started offline is sent later.
 */
const SYNC_MESSAGE = 'Saved in this browser. Connect to sync your sessions.';
type Cache = { sessions: PomodoroSession[]; currentID?: string | null; synced: Record<string, number> };
type Settings = { category: PomodoroCategory; minutes: number; autoBreak: boolean; sound: boolean };
const DEFAULT_SETTINGS: Settings = { category: 'focus', minutes: 25, autoBreak: true, sound: true };
const cacheKey = (owner: string) => `nexdo.pomodoro.v1.${owner}`;
const settingsKey = (owner: string) => `nexdo.pomodoro.settings.${owner}`;

function readJson<T>(key: string): T | null {
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function writeJson(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}

/** Two soft tones when a phase ends, when Play Sound is on. */
function chime() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + index * 0.25 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.25 + 0.45);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.25);
      oscillator.stop(context.currentTime + index * 0.25 + 0.5);
    });
    window.setTimeout(() => void context.close().catch(() => undefined), 1500);
  } catch { /* Sound is a nicety. */ }
}

export type Pomodoro = ReturnType<typeof usePomodoro>;

export function usePomodoro(owner: string) {
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [currentID, setCurrentID] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [syncMessage, setSyncMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const state = useRef<{ sessions: PomodoroSession[]; currentID: string | null }>({ sessions: [], currentID: null });
  const synced = useRef<Record<string, number>>({});
  const syncing = useRef(false);
  const ownerRef = useRef(owner);

  const commit = useCallback((next: { sessions?: PomodoroSession[]; currentID?: string | null }) => {
    state.current = { sessions: next.sessions ?? state.current.sessions, currentID: next.currentID === undefined ? state.current.currentID : next.currentID };
    setSessions(state.current.sessions);
    setCurrentID(state.current.currentID);
    if (ownerRef.current) writeJson(cacheKey(ownerRef.current), { ...state.current, synced: synced.current } satisfies Cache);
  }, []);

  /** Send every session whose revision is ahead of the last one the server acknowledged. */
  const sync = useCallback(async () => {
    const account = ownerRef.current;
    if (!account || syncing.current) return;
    syncing.current = true;
    try {
      for (;;) {
        const pending = state.current.sessions.find((session) => session.revision > (synced.current[session.id] ?? 0));
        if (!pending) break;
        const response = await fetch('/api/pomodoro', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerID: account, session: pending }) });
        if (!response.ok) throw new Error('sync');
        const saved = (await response.json()).session as PomodoroSession;
        if (ownerRef.current !== account) return;
        synced.current[pending.id] = saved.revision;
        commit({ sessions: state.current.sessions.map((session) => (session.id === pending.id && saved.revision >= session.revision ? saved : session)) });
      }
      setSyncMessage('');
    } catch {
      if (ownerRef.current === account) setSyncMessage(SYNC_MESSAGE);
    } finally {
      syncing.current = false;
    }
  }, [commit]);

  /** Advance the current session past a deadline that has gone by, chiming once when the phase changes. */
  const advance = useCallback(() => {
    const index = state.current.sessions.findIndex((session) => session.id === state.current.currentID);
    if (index === -1) return;
    const moved = tick(state.current.sessions[index], Date.now());
    if (!moved.changed) return;
    if (moved.shouldPlaySound) chime();
    const next = [...state.current.sessions];
    next[index] = moved.session;
    commit({ sessions: next });
    void sync();
  }, [commit, sync]);

  // Load this account's cache, then merge the server's history page by page.
  useEffect(() => {
    ownerRef.current = owner;
    if (!owner) return;
    let cancelled = false;
    const cache = readJson<Cache>(cacheKey(owner));
    synced.current = { ...(cache?.synced ?? {}) };
    state.current = { sessions: Array.isArray(cache?.sessions) ? cache.sessions : [], currentID: cache?.currentID ?? null };
    setSessions(state.current.sessions);
    setCurrentID(state.current.currentID);
    setSettingsState({ ...DEFAULT_SETTINGS, ...(readJson<Partial<Settings>>(settingsKey(owner)) ?? {}) });
    void (async () => {
      try {
        let cursor: string | null = null;
        do {
          const response: Response = await fetch(`/api/pomodoro?owner=${encodeURIComponent(owner)}${cursor ? `&cursor=${cursor}` : ''}`, { cache: 'no-store' });
          if (!response.ok) throw new Error('history');
          const page = (await response.json()) as { sessions: PomodoroSession[]; nextCursor: string | null };
          if (cancelled) return;
          const merged = [...state.current.sessions];
          const positions = new Map(merged.map((session, index) => [session.id, index]));
          for (const remote of page.sessions) {
            const index = positions.get(remote.id);
            if (index === undefined) { positions.set(remote.id, merged.length); merged.push(remote); }
            else if (remote.revision >= merged[index].revision) merged[index] = remote;
            synced.current[remote.id] = remote.revision;
          }
          commit({ sessions: merged });
          cursor = page.nextCursor;
        } while (cursor !== null);
        const sorted = [...state.current.sessions].sort((a, b) => b.startedAt - a.startedAt);
        commit({ sessions: sorted, currentID: state.current.currentID ?? sorted.find(isActive)?.id ?? null });
        advance();
        await sync();
      } catch {
        if (!cancelled) setSyncMessage(SYNC_MESSAGE);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, commit, advance, sync]);

  const current = useMemo(() => sessions.find((session) => session.id === currentID) ?? null, [sessions, currentID]);
  const running = Boolean(current && isActive(current));

  // One tick a second while a session is running; also when the tab comes back to the front.
  useEffect(() => {
    if (!running) return;
    const step = () => { setNow(Date.now()); advance(); };
    const interval = window.setInterval(step, 1000);
    document.addEventListener('visibilitychange', step);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', step); };
  }, [running, advance]);

  // "Distraction-free mode": keep the screen awake while the timer runs, where the browser allows it.
  useEffect(() => {
    if (!running || !current?.keepAwake || current.paused) return;
    let lock: { release: () => Promise<void> } | null = null;
    let released = false;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    void wakeLock?.request('screen').then((value) => { if (released) void value.release().catch(() => undefined); else lock = value; }).catch(() => undefined);
    return () => { released = true; void lock?.release().catch(() => undefined); };
  }, [running, current?.keepAwake, current?.paused]);

  const setSettings = useCallback((change: Partial<Settings>) => {
    setSettingsState((value) => {
      const next = { ...value, ...change, minutes: Math.min(120, Math.max(5, Math.trunc(change.minutes ?? value.minutes))) };
      if (ownerRef.current) writeJson(settingsKey(ownerRef.current), next);
      return next;
    });
  }, []);

  const start = useCallback((name = '') => {
    const active = state.current.sessions.find((session) => session.id === state.current.currentID);
    if (!ownerRef.current || (active && isActive(active))) return false;
    const session = newPomodoroSession({ id: crypto.randomUUID(), category: settings.category, name, durationMinutes: settings.minutes, autoBreak: settings.autoBreak, playSound: settings.sound, now: Date.now() });
    setNow(Date.now());
    commit({ sessions: [session, ...state.current.sessions], currentID: session.id });
    void sync();
    return true;
  }, [commit, settings, sync]);

  const mutate = useCallback((action: (session: PomodoroSession, at: number) => PomodoroSession) => {
    const index = state.current.sessions.findIndex((session) => session.id === state.current.currentID);
    if (index === -1) return;
    const next = [...state.current.sessions];
    next[index] = action(next[index], Date.now());
    setNow(Date.now());
    commit({ sessions: next });
    void sync();
  }, [commit, sync]);

  const clear = useCallback(() => { if (!running) commit({ currentID: null }); }, [commit, running]);

  return { ready: Boolean(owner), sessions, current, running, now, settings, setSettings, start, clear, syncMessage, retrySync: sync,
    pause: () => mutate(togglePause), stop: () => mutate(stop) };
}

const clock = (seconds: number) => { const whole = Math.ceil(seconds); return `${String(Math.trunc(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`; };
function spoken(seconds: number) {
  const minutes = Math.trunc(Math.max(0, seconds) / 60);
  if (minutes >= 60) return `${Math.trunc(minutes / 60)}h ${minutes % 60}m`;
  return minutes === 0 && seconds > 0 ? `${Math.trunc(seconds)}s` : `${minutes} min`;
}

/** The Focus Timer card: pick a length, start, pause, stop, and take the five-minute break. */
export function FocusTimerCard({ pomodoro, timeZone }: { pomodoro: Pomodoro; timeZone: string }) {
  const { current, settings, now } = pomodoro;
  const [options, setOptions] = useState(false);
  const [history, setHistory] = useState(false);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState(false);
  const active = Boolean(current && isActive(current));
  const onBreak = current?.phase === 'shortBreak';
  const finished = current && !active ? current : null;
  const today = useMemo(() => pomodoroAnalytics({ sessions: pomodoro.sessions, period: 'today', now, timeZone }), [pomodoro.sessions, now, timeZone]);

  return <section className="tk-card tk-focus" aria-labelledby="tk-focus-title">
    <div className="tk-card-head">
      <h2 id="tk-focus-title"><Timer size={22} aria-hidden="true" />Focus Timer</h2>
      <div className="tk-head-tools">
        {!active && <button type="button" aria-label="Focus options" aria-expanded={options} onClick={() => setOptions((value) => !value)}><Settings2 size={18} aria-hidden="true" /></button>}
        <button type="button" aria-label="Focus history" onClick={() => setHistory(true)}><History size={18} aria-hidden="true" /></button>
      </div>
    </div>

    {active && current ? <>
      <p className="tk-focus-phase">{onBreak ? 'Short Break' : POMODORO_CATEGORY_TITLES[current.category]}</p>
      <p className="tk-focus-name">{onBreak ? 'Time for a short break!' : current.name || 'Time to focus'}</p>
      <p className="tk-clock" role="timer" aria-label={`${Math.ceil(remaining(current, now) / 60)} minutes left`}>{clock(remaining(current, now))}</p>
      <div className="tk-progress" aria-hidden="true"><span style={{ width: `${Math.round(progress(current, now) * 100)}%` }} /></div>
      <p className="tk-focus-state">{current.paused ? 'Paused' : onBreak ? 'You’ve earned it! ☕' : '“Small steps. Big results.” 💪'}</p>
      {confirming ? <div className="tk-confirm-row" role="alertdialog" aria-label="Stop this focus session?">
        <p>Stop this focus session? Your time so far is saved in history.</p>
        <button type="button" className="tk-ghost" onClick={() => setConfirming(false)}>Keep going</button>
        <button type="button" className="tk-danger" onClick={() => { setConfirming(false); pomodoro.stop(); }}>Stop session</button>
      </div> : <div className="tk-focus-actions">
        {onBreak ? <>
          <button type="button" className="tk-ghost" onClick={pomodoro.stop}><SkipForward size={18} aria-hidden="true" />Skip</button>
          <button type="button" className="tk-primary" onClick={pomodoro.stop}><Square size={16} aria-hidden="true" />End Break</button>
        </> : <>
          <button type="button" className="tk-primary" onClick={pomodoro.pause}>{current.paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}{current.paused ? 'Resume' : 'Pause'}</button>
          <button type="button" className="tk-ghost" onClick={() => setConfirming(true)}><Square size={16} aria-hidden="true" />Stop</button>
        </>}
      </div>}
    </> : finished ? <>
      <p className="tk-focus-phase">{finished.phase === 'completed' ? 'Great job!' : 'Session stopped'}</p>
      <p className="tk-focus-name">{finished.phase === 'completed' ? 'Focus session completed.' : 'Your focus time has been saved.'}</p>
      <p className="tk-clock tk-clock-done">{spoken(focusedSeconds(finished, now))}</p>
      <p className="tk-focus-state">{POMODORO_CATEGORY_TITLES[finished.category]}{finished.name ? ` · ${finished.name}` : ''}</p>
      <div className="tk-focus-actions"><button type="button" className="tk-primary" onClick={pomodoro.clear}><Play size={18} aria-hidden="true" />Start Another Session</button></div>
    </> : <>
      <div className="tk-dial">
        <button type="button" aria-label="Five minutes less" disabled={settings.minutes <= 5} onClick={() => pomodoro.setSettings({ minutes: settings.minutes - 5 })}><ChevronLeft size={20} aria-hidden="true" /></button>
        <p className="tk-clock" aria-live="polite" aria-label={`${settings.minutes} minutes`}>{String(settings.minutes).padStart(2, '0')}:00</p>
        <button type="button" aria-label="Five minutes more" disabled={settings.minutes >= 120} onClick={() => pomodoro.setSettings({ minutes: settings.minutes + 5 })}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
      {options && <div className="tk-focus-options">
        <label>Focus Category<select value={settings.category} onChange={(event) => pomodoro.setSettings({ category: event.target.value as PomodoroCategory })}>{POMODORO_CATEGORIES.map((category) => <option key={category} value={category}>{POMODORO_CATEGORY_TITLES[category]}</option>)}</select></label>
        <label>Session name<input value={name} maxLength={120} placeholder="Optional" onChange={(event) => setName(event.target.value)} /></label>
        <label className="tk-switch"><span>Auto Start Break<small>Start a 5-minute break automatically after focus.</small></span><input type="checkbox" checked={settings.autoBreak} onChange={(event) => pomodoro.setSettings({ autoBreak: event.target.checked })} /></label>
        <label className="tk-switch"><span>Play Sound</span><input type="checkbox" checked={settings.sound} onChange={(event) => pomodoro.setSettings({ sound: event.target.checked })} /></label>
      </div>}
      <div className="tk-focus-actions"><button type="button" className="tk-primary tk-start" disabled={!pomodoro.ready} onClick={() => { if (pomodoro.start(name)) setName(''); }}><Play size={20} aria-hidden="true" />Start Focus</button></div>
      <p className="tk-focus-state">{today.focusSeconds > 0 ? `${spoken(today.focusSeconds)} focused today · ${today.sessions.length} ${today.sessions.length === 1 ? 'session' : 'sessions'}` : POMODORO_CATEGORY_TITLES[settings.category]}</p>
    </>}
    {pomodoro.syncMessage && <p className="tk-sync" role="status">{pomodoro.syncMessage} <button type="button" onClick={() => void pomodoro.retrySync()}>Retry sync</button></p>}
    {history && <FocusHistory pomodoro={pomodoro} timeZone={timeZone} onClose={() => setHistory(false)} />}
  </section>;
}

/** Focus totals and the session list for Today, This Week, This Month or All Time. */
function FocusHistory({ pomodoro, timeZone, onClose }: { pomodoro: Pomodoro; timeZone: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [period, setPeriod] = useState<PomodoroPeriod>('week');
  const stats = useMemo(() => pomodoroAnalytics({ sessions: pomodoro.sessions, period, now: pomodoro.now, timeZone }), [pomodoro.sessions, pomodoro.now, period, timeZone]);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const day = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(at));
  const time = (seconds: number) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(seconds * 1000));
  const status = (session: PomodoroSession) => session.phase === 'completed' ? 'Completed' : session.phase === 'stopped' ? 'Stopped' : session.paused ? 'Paused' : session.phase === 'shortBreak' ? 'On break' : 'In progress';
  const peak = Math.max(1, ...stats.buckets.map((bucket) => bucket.seconds));

  return <dialog ref={dialog} className="nx-sheet tk-history" aria-labelledby="tk-history-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="nx-sheet-head"><span /><h2 id="tk-history-title">Focus history</h2><button type="button" className="nx-pill-button" aria-label="Close focus history" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <div className="nx-sheet-body">
      <div className="tk-periods" role="tablist" aria-label="Period">{POMODORO_PERIODS.map((value) => <button key={value} type="button" role="tab" aria-selected={period === value} onClick={() => setPeriod(value)}>{POMODORO_PERIOD_TITLES[value]}</button>)}</div>
      <div className="tk-history-stats">
        <p><strong>{spoken(stats.focusSeconds)}</strong><span>Focus time</span></p>
        <p><strong>{stats.completedCount}</strong><span>Completed</span></p>
        <p><strong>{stats.focusRate === null ? '–' : `${Math.round(stats.focusRate * 100)}%`}</strong><span>Focus rate</span></p>
        <p><strong>{spoken(stats.breakSeconds)}</strong><span>Breaks</span></p>
      </div>
      {stats.changePercent !== null && <p className="tk-history-change">{stats.changePercent >= 0 ? '▲' : '▼'} {Math.abs(stats.changePercent)}% against the period before</p>}
      {stats.buckets.length > 1 && stats.focusSeconds > 0 && <div className="tk-history-bars" role="img" aria-label="Focus time across the period">{stats.buckets.map((bucket) => <span key={bucket.start} title={spoken(bucket.seconds)} style={{ height: `${Math.max(4, Math.round((bucket.seconds / peak) * 100))}%` }} data-empty={bucket.seconds === 0} />)}</div>}
      {stats.categories.length > 0 && <ul className="tk-history-categories">{stats.categories.map((item) => <li key={item.category}><span>{POMODORO_CATEGORY_TITLES[item.category]}</span><strong>{spoken(item.seconds)}</strong></li>)}</ul>}
      {stats.days.length ? stats.days.map((group) => <section key={group.date} className="tk-history-day">
        <h3>{day(group.date)}</h3>
        <ul>{group.sessions.map((session) => <li key={session.id}><span><strong>{session.name || POMODORO_CATEGORY_TITLES[session.category]}</strong><small>{time(session.startedAt)} · {POMODORO_CATEGORY_TITLES[session.category]} · {status(session)}</small></span><em>{spoken(focusedSeconds(session, pomodoro.now))}</em></li>)}</ul>
      </section>) : <div className="tk-history-empty"><Image src="/tasks/hourglass.webp" alt="" width={110} height={110} className="tk-empty-art" /><p>No focus sessions in this period yet.</p></div>}
    </div>
  </dialog>;
}
