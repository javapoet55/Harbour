'use client';

import { useEffect, useRef, useState } from 'react';
import { AlignLeft, Bell, BellRing, CalendarDays, Check, Clock, FileText, Mail, MapPin, Phone, Trash2 } from 'lucide-react';
import { scheduleFetch } from '@/lib/schedule-fetch';
import { zonedDateTime } from '@/lib/time';
import { ymdInZone } from '@/lib/task-list';

export type Note = { id: string; title: string; body: string; createdAt: string; updatedAt: string };

/** "HH:mm" for the next whole hour in the account's zone, and the date that hour falls on. */
function nextHour(timeZone: string, now = Date.now()) {
  const next = new Date(Math.ceil((now + 60_000) / 3_600_000) * 3_600_000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(next).map((part) => [part.type, part.value]));
  return { date: ymdInZone(+next, timeZone), time: `${parts.hour}:${parts.minute}` };
}
function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, hour * 60 + minute + minutes);
  return `${String(Math.trunc(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
/** The instant for a date and time in the account's zone, or null when that local time does not exist. */
function instant(date: string, time: string, timeZone: string): number | null {
  try { return +zonedDateTime(date, time, timeZone); } catch { return null; }
}

/** A bottom sheet on phones and a centred dialog on wider screens, with the same header as Create New Task. */
function Sheet({ id, title, busy, canSave, saveLabel, onClose, onSubmit, children, footer }: {
  id: string; title: string; busy: boolean; canSave: boolean; saveLabel: string; onClose: () => void; onSubmit: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    element?.querySelector<HTMLElement>('input, textarea')?.focus();
    return () => { element?.close(); opener?.focus(); };
  }, []);
  return <dialog ref={dialog} className="nx-sheet" aria-labelledby={id} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); if (canSave && !busy) onSubmit(); }} aria-busy={busy}>
      <header className="nx-sheet-head">
        <button type="button" className="nx-pill-button" disabled={busy} onClick={onClose}>Close</button>
        <h2 id={id}>{title}</h2>
        <span />
      </header>
      <div className="nx-sheet-body">{children}</div>
      <footer className="nx-sheet-foot">{footer}<button type="submit" className="nx-primary" disabled={!canSave || busy}>{saveLabel}</button></footer>
    </form>
  </dialog>;
}

/**
 * Quick Add → Reminder: a short item that notifies at its own time. It is saved as a five-minute
 * reminder task, the same way the voice assistant saves one, and appears in the task list.
 */
export function ReminderSheet({ timeZone, onClose, onSaved }: { timeZone: string; onClose: () => void; onSaved: (title: string, at: number) => void }) {
  const start = nextHour(timeZone);
  const key = useRef(crypto.randomUUID());
  const [today] = useState(() => ymdInZone(Date.now(), timeZone));
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [popup, setPopup] = useState(true);
  const [email, setEmail] = useState(true);
  const [call, setCall] = useState(false);
  const callSetup = useReminderCallSetup(call);
  const at = instant(date, time, timeZone);
  const chosen = popup || email || call;
  const callReady = !call || callSetup.verified;

  async function save() {
    if (at === null) { setError('That time doesn’t exist on this date. Choose another time.'); return; }
    if (at <= Date.now()) { setError('Choose a time in the future.'); return; }
    if (!chosen) { setError('Choose at least one way to be reminded.'); return; }
    if (!callReady) { setError('Verify your phone number so Nexdo can call you, or turn off Call.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), notes, startAt: new Date(at).toISOString(), reminder: true, notifyPush: popup, notifyEmail: email, notifyCall: call, idempotencyKey: key.current }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Couldn’t save your reminder. Please try again.');
      onSaved(title.trim(), at);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t save your reminder. Please try again.');
      setBusy(false);
    }
  }

  return <Sheet id="reminder-sheet-title" title="New Reminder" busy={busy} canSave={title.trim().length > 0 && Boolean(date && time) && chosen && callReady} saveLabel={busy ? 'Saving…' : 'Save Reminder'} onClose={onClose} onSubmit={() => void save()}>
    <div className="nx-form-card">
      <div><label className="nx-label" htmlFor="reminder-title"><Bell size={15} aria-hidden="true" />REMIND ME TO</label>
        <input id="reminder-title" className="nx-field nx-title-field" maxLength={200} autoComplete="off" placeholder="Pick up the dry cleaning" value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></div>
      <hr />
      <div className="qa-two">
        <div><label className="nx-label" htmlFor="reminder-date"><CalendarDays size={15} aria-hidden="true" />DATE</label><input id="reminder-date" type="date" className="nx-field" value={date} min={today} disabled={busy} onChange={(event) => setDate(event.target.value)} /></div>
        <div><label className="nx-label" htmlFor="reminder-time"><Clock size={15} aria-hidden="true" />TIME</label><input id="reminder-time" type="time" className="nx-field" value={time} disabled={busy} onChange={(event) => setTime(event.target.value)} /></div>
      </div>
      <hr />
      <div><label className="nx-label" htmlFor="reminder-notes"><AlignLeft size={15} aria-hidden="true" />NOTES</label>
        <textarea id="reminder-notes" className="nx-field" rows={2} maxLength={4000} placeholder="Optional" value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} /></div>
      <hr />
      <fieldset className="qa-delivery" disabled={busy}>
        <legend className="nx-label"><BellRing size={15} aria-hidden="true" />REMIND ME BY</legend>
        <div className="qa-delivery-options">
          <DeliveryToggle icon={<Bell size={18} aria-hidden="true" />} label="Pop-up" detail="Browser notification" checked={popup} onChange={setPopup} />
          <DeliveryToggle icon={<Mail size={18} aria-hidden="true" />} label="Email" detail="To your inbox" checked={email} onChange={setEmail} />
          <DeliveryToggle icon={<Phone size={18} aria-hidden="true" />} label="Call" detail="Reads it aloud" checked={call} onChange={setCall} />
        </div>
      </fieldset>
      {call && <CallSetup setup={callSetup} disabled={busy} />}
      <p className="nx-hint">{call
        ? 'At this time Nexdo calls you and reads the reminder and its notes. Press 1 on the call to hear it again, or 2 to mark it done.'
        : 'Nexdo notifies you at this time, the same way it does for reminders you set by voice.'}</p>
    </div>
    {error && <p role="alert" className="nx-sheet-error">{error}</p>}
  </Sheet>;
}

function DeliveryToggle({ icon, label, detail, checked, onChange }: { icon: React.ReactNode; label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={`qa-delivery-option${checked ? ' is-on' : ''}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span className="qa-delivery-icon">{icon}</span>
    <span className="qa-delivery-text"><strong>{label}</strong><small>{detail}</small></span>
    <span className="qa-delivery-check" aria-hidden="true">{checked && <Check size={14} />}</span>
  </label>;
}

type CallSetupState = {
  loading: boolean; available: boolean; verified: boolean; phone: string;
  stage: 'phone' | 'code'; working: boolean; message: string; problem: string;
  setPhone: (value: string) => void; sendCode: () => void; verify: (code: string) => void; change: () => void;
};

/** Mobile number as Nexdo expects it: international format with the formatting characters removed. */
const cleanPhone = (value: string) => value.replace(/[\s().-]/g, '');
/** +16505550123 → +1 650 555 0123; other numbers are shown as stored. */
const showPhone = (value: string) => /^\+1\d{10}$/.test(value) ? `+1 ${value.slice(2, 5)} ${value.slice(5, 8)} ${value.slice(8)}` : value;

/** Loads whether reminder calls can be placed and walks the person through verifying their number. */
function useReminderCallSetup(active: boolean): CallSetupState {
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [verified, setVerified] = useState(false);
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!active || loaded) return;
    let cancelled = false;
    void fetch('/api/reminder-calls', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((data) => {
      if (cancelled) return;
      setLoaded(true);
      setAvailable(Boolean(data?.available));
      setVerified(Boolean(data?.verified));
      if (typeof data?.phone === 'string') setPhone(data.phone);
      if (!data) setProblem('Couldn’t check your phone number. Please try again.');
    }).catch(() => { if (!cancelled) { setLoaded(true); setProblem('Couldn’t check your phone number. Please try again.'); } });
    return () => { cancelled = true; };
  }, [active, loaded]);

  async function phoneRequest(body: object) {
    const response = await fetch('/api/nutrition/phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Something went wrong. Please try again.');
    return payload;
  }
  async function sendCode() {
    const number = cleanPhone(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(number)) { setProblem('Enter your mobile number with its country code, for example +1 650 555 0123.'); return; }
    setWorking(true); setProblem(''); setMessage('');
    try {
      const result = await phoneRequest({ action: 'start', phone: number });
      if (result?.alreadyVerified) { setVerified(true); setPhone(number); return; }
      setPhone(number);
      setStage('code');
      setMessage(`Nexdo is calling ${showPhone(number)} now and will read you a 6-digit code.`);
    } catch (reason) { setProblem(reason instanceof Error ? reason.message : 'Couldn’t send the code.'); }
    finally { setWorking(false); }
  }
  async function verify(code: string) {
    if (!/^\d{6}$/.test(code)) { setProblem('Enter the 6-digit code from the call.'); return; }
    setWorking(true); setProblem('');
    try {
      const result = await phoneRequest({ action: 'verify', code });
      if (!result?.phoneVerified) throw new Error('That code didn’t work. Send a new code and try again.');
      setVerified(true); setMessage('');
    } catch (reason) { setProblem(reason instanceof Error ? reason.message : 'Couldn’t verify the code.'); }
    finally { setWorking(false); }
  }
  return {
    loading: active && !loaded, available, verified, phone, stage, working, message, problem,
    setPhone, sendCode: () => void sendCode(), verify: (code) => void verify(code),
    change: () => { setVerified(false); setStage('phone'); setMessage(''); setProblem(''); },
  };
}

function CallSetup({ setup, disabled }: { setup: CallSetupState; disabled: boolean }) {
  const [code, setCode] = useState('');
  if (setup.loading) return <div className="qa-call" aria-live="polite"><p className="nx-hint">Checking your phone number…</p></div>;
  if (!setup.available) return <div className="qa-call" role="alert"><p className="qa-call-problem">{setup.problem || 'Reminder calls aren’t available right now. Choose pop-up or email instead.'}</p></div>;
  if (setup.verified) return <div className="qa-call is-verified" aria-live="polite">
    <Phone size={16} aria-hidden="true" />
    <p>Nexdo will call <strong>{showPhone(setup.phone)}</strong></p>
    <button type="button" className="nx-pill-button" disabled={disabled} onClick={setup.change}>Change</button>
  </div>;
  const enter = (run: () => void) => (event: React.KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); run(); } };
  return <div className="qa-call" aria-live="polite">
    <p className="qa-call-title">Verify the number Nexdo should call</p>
    {setup.stage === 'phone' ? <div className="qa-call-row">
      <label className="sr-only" htmlFor="reminder-phone">Mobile number</label>
      <input id="reminder-phone" type="tel" inputMode="tel" autoComplete="tel" className="nx-field" placeholder="+1 650 555 0123" value={setup.phone} disabled={disabled || setup.working}
        onChange={(event) => setup.setPhone(event.target.value)} onKeyDown={enter(setup.sendCode)} />
      <button type="button" className="nx-primary qa-call-button" disabled={disabled || setup.working || !setup.phone.trim()} onClick={setup.sendCode}>{setup.working ? 'Calling…' : 'Call me with a code'}</button>
    </div> : <div className="qa-call-row">
      <label className="sr-only" htmlFor="reminder-code">6-digit code</label>
      <input id="reminder-code" className="nx-field" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={code} disabled={disabled || setup.working}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} onKeyDown={enter(() => setup.verify(code))} />
      <button type="button" className="nx-primary qa-call-button" disabled={disabled || setup.working || code.length !== 6} onClick={() => setup.verify(code)}>{setup.working ? 'Checking…' : 'Verify'}</button>
    </div>}
    {setup.message && <p className="nx-hint">{setup.message} <button type="button" className="qa-link" disabled={setup.working} onClick={setup.change}>Use a different number</button></p>}
    {setup.problem && <p className="qa-call-problem" role="alert">{setup.problem}</p>}
  </div>;
}

/** Quick Add → Event: a calendar event, saved and sent to a connected calendar like events made on the Calendar page. */
export function EventSheet({ timeZone, onClose, onSaved }: { timeZone: string; onClose: () => void; onSaved: (title: string, message: string) => void }) {
  const start = nextHour(timeZone);
  const key = useRef(crypto.randomUUID());
  const [today] = useState(() => ymdInZone(Date.now(), timeZone));
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(start.date);
  const [from, setFrom] = useState(start.time);
  const [to, setTo] = useState(addMinutes(start.time, 60));
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const startAt = instant(date, from, timeZone);
    const endAt = instant(date, to, timeZone);
    if (startAt === null || endAt === null) { setError('That time doesn’t exist on this date. Choose another time.'); return; }
    if (startAt <= Date.now()) { setError('Choose a start time in the future.'); return; }
    if (endAt <= startAt) { setError('The event must end after it starts.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await scheduleFetch('/api/calendar/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: key.current, title: title.trim(), notes, location, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) throw new Error(response.status === 409 ? 'The event was not saved. Choose another time.' : payload?.error || 'Couldn’t save your event. Please try again.');
      onSaved(title.trim(), typeof payload?.message === 'string' ? payload.message : '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t save your event. Please try again.');
      setBusy(false);
    }
  }

  return <Sheet id="event-sheet-title" title="New Event" busy={busy} canSave={title.trim().length > 0 && Boolean(date && from && to)} saveLabel={busy ? 'Saving…' : 'Save Event'} onClose={onClose} onSubmit={() => void save()}>
    <div className="nx-form-card">
      <div><label className="nx-label" htmlFor="event-title"><CalendarDays size={15} aria-hidden="true" />EVENT</label>
        <input id="event-title" className="nx-field nx-title-field" maxLength={200} autoComplete="off" placeholder="Dinner with Priya" value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></div>
      <hr />
      <div><label className="nx-label" htmlFor="event-date"><CalendarDays size={15} aria-hidden="true" />DATE</label><input id="event-date" type="date" className="nx-field" value={date} min={today} disabled={busy} onChange={(event) => setDate(event.target.value)} /></div>
      <div className="qa-two">
        <div><label className="nx-label" htmlFor="event-from"><Clock size={15} aria-hidden="true" />STARTS</label><input id="event-from" type="time" className="nx-field" value={from} disabled={busy} onChange={(event) => { const value = event.target.value; setFrom(value); if (value && to <= value) setTo(addMinutes(value, 60)); }} /></div>
        <div><label className="nx-label" htmlFor="event-to"><Clock size={15} aria-hidden="true" />ENDS</label><input id="event-to" type="time" className="nx-field" value={to} disabled={busy} onChange={(event) => setTo(event.target.value)} /></div>
      </div>
      <hr />
      <div><label className="nx-label" htmlFor="event-location"><MapPin size={15} aria-hidden="true" />LOCATION</label>
        <input id="event-location" className="nx-field" maxLength={200} autoComplete="off" placeholder="Optional" value={location} disabled={busy} onChange={(event) => setLocation(event.target.value)} /></div>
      <div><label className="nx-label" htmlFor="event-notes"><AlignLeft size={15} aria-hidden="true" />NOTES</label>
        <textarea id="event-notes" className="nx-field" rows={2} maxLength={4000} placeholder="Optional" value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} /></div>
    </div>
    {error && <p role="alert" className="nx-sheet-error">{error}</p>}
  </Sheet>;
}

/** Quick Add → Note, and editing a note from the Notes tab. */
export function NoteSheet({ note, onClose, onSaved, onDeleted }: { note: Note | null; onClose: () => void; onSaved: (note: Note) => void; onDeleted?: (id: string) => void }) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const changed = !note || title !== note.title || body !== note.body;

  async function save() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(note ? `/api/notes/${note.id}` : '/api/notes', { method: note ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), body }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.note) throw new Error(payload?.error || 'Couldn’t save your note. Please try again.');
      onSaved(payload.note);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t save your note. Please try again.');
      setBusy(false);
    }
  }
  async function remove() {
    if (!note) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Couldn’t delete this note. Please try again.');
      onDeleted?.(note.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t delete this note. Please try again.');
      setBusy(false);
      setConfirming(false);
    }
  }

  return <Sheet id="note-sheet-title" title={note ? 'Edit Note' : 'New Note'} busy={busy} canSave={changed && (title.trim().length > 0 || body.trim().length > 0)} saveLabel={busy ? 'Saving…' : 'Save Note'} onClose={onClose} onSubmit={() => void save()}
    footer={note ? (confirming
      ? <><button type="button" className="nx-secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep</button><button type="button" className="nx-primary nx-danger" disabled={busy} onClick={() => void remove()}>Delete note</button></>
      : <button type="button" className="nx-secondary" aria-label="Delete note" disabled={busy} onClick={() => setConfirming(true)}><Trash2 size={18} aria-hidden="true" /></button>) : undefined}>
    <div className="nx-form-card">
      <div><label className="nx-label" htmlFor="note-title"><FileText size={15} aria-hidden="true" />TITLE</label>
        <input id="note-title" className="nx-field nx-title-field" maxLength={200} autoComplete="off" placeholder="Untitled note" value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></div>
      <div><label className="nx-label" htmlFor="note-body"><AlignLeft size={15} aria-hidden="true" />NOTE</label>
        <textarea id="note-body" className="nx-field qa-note-body" rows={9} maxLength={20000} placeholder="Write anything you want to keep: ideas, lists, details for later…" value={body} disabled={busy} onChange={(event) => setBody(event.target.value)} /></div>
    </div>
    {confirming && <p role="alert" className="nx-sheet-error">Delete this note? This can’t be undone.</p>}
    {error && <p role="alert" className="nx-sheet-error">{error}</p>}
  </Sheet>;
}
