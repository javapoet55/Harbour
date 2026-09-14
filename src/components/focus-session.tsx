'use client';
import { scheduleFetch } from '@/lib/schedule-fetch';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { focusSecondsRemaining, type FocusSessionState } from '@/lib/focus-session';

type FocusController = { session: FocusSessionState | null; seconds: number; start: (taskId: string, title: string, minutes?: number, fromRecommendation?: boolean) => Promise<void>; toggle: () => Promise<void>; stop: () => Promise<void>; loading: boolean; error: string };
const Context = createContext<FocusController | null>(null);
async function finishSegment(session: FocusSessionState) {
  if (!session.workSessionId && !session.focusToken) return;
  const response = await scheduleFetch(`/api/tasks/${session.taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ focusAction: 'finish', workSessionId: session.workSessionId, focusToken: session.focusToken, endedAt: new Date(Math.min(Date.now(), session.endsAt ?? Date.now())).toISOString() }) });
  if (!response.ok) throw new Error('Could not save your focus time. Please retry.');
}
export function useFocusSession() {
  const value = useContext(Context);
  if (!value) throw new Error('FocusSessionProvider is required');
  return value;
}

/** Extracted from Today's timer: one countdown shared by Today, task details and Ask AI. */
export function FocusSessionProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [session, setSession] = useState<FocusSessionState | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const starting = useRef(false);
  const storageKey = `nexdo:focus:${userId}`;
  useEffect(() => {
    // Hydrate optional browser storage after the server-rendered first frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as FocusSessionState | null;
      if (saved && typeof saved.taskId === 'string' && typeof saved.title === 'string' && Number.isFinite(saved.remainingSeconds) && (saved.endsAt === null || Number.isFinite(saved.endsAt))) {
        setSession(saved); setSeconds(focusSecondsRemaining(saved));
      }
    } catch { /* Browser storage is optional. */ }
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try { if (session) sessionStorage.setItem(storageKey, JSON.stringify(session)); else sessionStorage.removeItem(storageKey); } catch { /* private browsing */ }
  }, [session, ready, storageKey]);
  useEffect(() => {
    if (!session) return;
    const tick = () => setSeconds(focusSecondsRemaining(session));
    tick(); const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [session]);
  useEffect(() => {
    if ((!session?.workSessionId && !session?.focusToken) || !session?.endsAt || seconds > 0) return;
    const finished = session;
    void finishSegment(finished).then(() => { setSession((current) => current && current.focusToken === finished.focusToken ? { ...current, workSessionId: null, focusToken: undefined } : current); window.dispatchEvent(new Event('harbor:focus-completed')); }).catch((reason: Error) => setError(reason.message));
  }, [session, seconds]);
  const stop = async () => {
    if (starting.current) return;
    starting.current = true; setLoading(true); setError('');
    try { if (session) await finishSegment(session); setSession(null); setSeconds(0); window.dispatchEvent(new Event('harbor:tasks-updated')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not end focus.'); }
    finally { starting.current = false; setLoading(false); }
  };
  const toggle = async () => {
    if (!session || starting.current) return;
    starting.current = true; setLoading(true); setError('');
    try {
      if (session.endsAt !== null) {
        const remainingSeconds = focusSecondsRemaining(session);
        await finishSegment(session);
        setSession({ ...session, remainingSeconds, endsAt: null, workSessionId: null, focusToken: undefined }); setSeconds(remainingSeconds);
      } else if (session.remainingSeconds > 0) {
        const response = await scheduleFetch(`/api/tasks/${session.taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IN_PROGRESS', focusMinutes: Math.ceil(session.remainingSeconds / 60) }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not resume focus.');
        setSession({ ...session, endsAt: Date.now() + session.remainingSeconds * 1000, workSessionId: payload.focus.workSessionId, focusToken: payload.focus.focusToken });
      }
      window.dispatchEvent(new Event('harbor:tasks-updated'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update focus.'); }
    finally { starting.current = false; setLoading(false); }
  };
  const start = async (taskId: string, title: string, minutes = 25, fromRecommendation = false) => {
    if (starting.current) return;
    starting.current = true; setLoading(true); setError('');
    try {
      if (session) {
        await finishSegment(session);
        const remainingSeconds = focusSecondsRemaining(session);
        setSession({ ...session, remainingSeconds, endsAt: null, workSessionId: null, focusToken: undefined }); setSeconds(remainingSeconds);
      }
      const response = await scheduleFetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IN_PROGRESS', focusMinutes: minutes, fromRecommendation }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not start focus.');
      const remainingSeconds = payload.focus.minutes * 60;
      setSession({ taskId, title, remainingSeconds, endsAt: Date.now() + remainingSeconds * 1000, workSessionId: payload.focus.workSessionId, focusToken: payload.focus.focusToken }); setSeconds(remainingSeconds);
      window.dispatchEvent(new Event('harbor:tasks-updated'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start focus.'); }
    finally { starting.current = false; setLoading(false); }
  };
  return <Context.Provider value={{ session, seconds, start, toggle, stop, loading, error }}>{children}</Context.Provider>;
}

export function FocusSessionControl({ taskId, title }: { taskId: string; title: string }) {
  const focus = useFocusSession();
  const active = focus.session?.taskId === taskId;
  return <div><button type="button" className="harbor-btn w-full" disabled={focus.loading} onClick={() => { if (active && focus.seconds > 0) focus.toggle(); else void focus.start(taskId, title); }}>{active ? `${focus.seconds === 0 ? 'Finished' : focus.session?.endsAt ? 'Pause' : 'Resume'} focus · ${formatFocus(focus.seconds)}` : 'Start a 25-minute focus session'}</button>{focus.error && <p role="alert">{focus.error}</p>}</div>;
}
export const formatFocus = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function FocusSessionBanner() {
  const focus = useFocusSession();
  if (!focus.session) return null;
  return <aside className="nexdo-focus-banner" aria-label="Active focus session"><div><strong>{focus.seconds ? focus.session.title : 'Focus session finished'}</strong><span aria-label={`${focus.seconds} seconds remaining`}>{formatFocus(focus.seconds)}</span>{focus.error && <p role="alert">{focus.error}</p>}</div><button type="button" aria-label={focus.session.endsAt ? 'Pause focus session' : 'Resume focus session'} disabled={!focus.seconds || focus.loading} onClick={() => void focus.toggle()}>{focus.session.endsAt ? <Pause size={18} /> : <Play size={18} />}</button><button type="button" aria-label="End focus session" disabled={focus.loading} onClick={() => void focus.stop()}><X size={18} /></button></aside>;
}
