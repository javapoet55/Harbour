'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlignLeft, CalendarDays, Clock, MapPin, Trash2 } from 'lucide-react';
import { scheduleFetch } from '@/lib/schedule-fetch';
import { eventIssue, eventPatch, isEditable, type CalendarEventRecord } from '@/lib/calendar-events';
import { instant, localParts, Sheet } from './quick-add-sheets';
import './tasks-screen.css';
import './tasks-dashboard.css';

type Fallback = { title: string; startAt: string; endAt: string; allDay?: boolean };

async function problem(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' && body.error ? body.error : fallback;
}

const describe = (ms: number, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

/** Edit an event made in Nexdo: title, start, end (which may be another day), location and notes. */
function EventEditSheet({ event, timeZone, onClose, onSaved }: { event: CalendarEventRecord; timeZone: string; onClose: () => void; onSaved: (message: string) => void }) {
  const start = localParts(Date.parse(event.startAt), timeZone);
  const end = localParts(Date.parse(event.endAt), timeZone);
  const [title, setTitle] = useState(event.title);
  const [startDate, setStartDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [location, setLocation] = useState(event.location);
  const [notes, setNotes] = useState(event.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const startMs = instant(startDate, startTime, timeZone) ?? NaN;
    const endMs = instant(endDate, endTime, timeZone) ?? NaN;
    const edit = { title, notes, location, startMs, endMs };
    const body = eventPatch(event, edit);
    const issue = eventIssue(edit, 'startAt' in body, Date.now());
    if (issue) { setError(issue); return; }
    if (Object.keys(body).length === 0) { onClose(); return; }
    setBusy(true);
    setError('');
    try {
      const response = await scheduleFetch(`/api/calendar/events/${event.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await problem(response, 'Couldn’t save your changes. Please try again.'));
      const payload = await response.json().catch(() => null);
      onSaved(typeof payload?.message === 'string' ? payload.message : '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t save your changes. Please try again.');
      setBusy(false);
    }
  }

  return <Sheet id="event-edit-title" title="Edit Event" busy={busy} canSave={title.trim().length > 0} saveLabel={busy ? 'Saving…' : 'Save Changes'} onClose={onClose} onSubmit={() => void save()}>
    <div className="nx-form-card">
      <div><label className="nx-label" htmlFor="ev-title"><CalendarDays size={15} aria-hidden="true" />EVENT</label>
        <input id="ev-title" className="nx-field nx-title-field" maxLength={200} autoComplete="off" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></div>
      <hr />
      <div className="qa-two">
        <div><label className="nx-label" htmlFor="ev-sd"><Clock size={15} aria-hidden="true" />START DATE</label><input id="ev-sd" type="date" className="nx-field" value={startDate} disabled={busy} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div><label className="nx-label" htmlFor="ev-st">START TIME</label><input id="ev-st" type="time" className="nx-field" value={startTime} disabled={busy} onChange={(e) => setStartTime(e.target.value)} /></div>
      </div>
      <div className="qa-two">
        <div><label className="nx-label" htmlFor="ev-ed"><Clock size={15} aria-hidden="true" />END DATE</label><input id="ev-ed" type="date" className="nx-field" value={endDate} disabled={busy} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div><label className="nx-label" htmlFor="ev-et">END TIME</label><input id="ev-et" type="time" className="nx-field" value={endTime} disabled={busy} onChange={(e) => setEndTime(e.target.value)} /></div>
      </div>
      <p className="nx-hint">Times are in your account time zone ({timeZone}). A moved event must start in the future.</p>
      <hr />
      <div><label className="nx-label" htmlFor="ev-loc"><MapPin size={15} aria-hidden="true" />LOCATION</label>
        <input id="ev-loc" className="nx-field" maxLength={200} autoComplete="off" value={location} disabled={busy} onChange={(e) => setLocation(e.target.value)} /></div>
      <div><label className="nx-label" htmlFor="ev-notes"><AlignLeft size={15} aria-hidden="true" />NOTES</label>
        <textarea id="ev-notes" className="nx-field" rows={3} maxLength={4000} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} /></div>
    </div>
    {error && <p role="alert" className="nx-sheet-error">{error}</p>}
  </Sheet>;
}

/**
 * An appointment's details. Events made in Nexdo can be edited or deleted; imported events (Google,
 * Outlook) are shown as they are and are changed in their own calendar.
 */
export function EventDetailSheet({ eventId, fallback, timeZone, onClose, onChanged }: { eventId: string; fallback: Fallback; timeZone: string; onClose: () => void; onChanged: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [event, setEvent] = useState<CalendarEventRecord | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); opener?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/calendar/events/${encodeURIComponent(eventId)}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load'))))
      .then((payload: { event: CalendarEventRecord }) => setEvent(payload.event))
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true); });
    return () => controller.abort();
  }, [eventId]);

  async function remove() {
    if (!event) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await problem(response, 'Couldn’t delete this event. Please try again.'));
      const payload = await response.json().catch(() => null);
      onChanged(typeof payload?.message === 'string' ? payload.message : 'Event deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t delete this event. Please try again.');
      setBusy(false);
      setConfirming(false);
    }
  }

  if (editing && event) return <EventEditSheet event={event} timeZone={timeZone} onClose={() => setEditing(false)} onSaved={(message) => onChanged(message || 'Event updated.')} />;

  const shown = event ?? { ...fallback, notes: '', location: '' };
  const startMs = Date.parse(shown.startAt);
  const endMs = Date.parse(shown.endAt);
  const editable = event !== null && isEditable(event);

  return <dialog ref={dialog} className="nx-sheet" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }} aria-busy={busy}>
      <header className="nx-sheet-head">
        <button type="button" className="nx-pill-button" disabled={busy} onClick={onClose}>Close</button>
        <h2 id={titleId}>Appointment</h2>
        <span />
      </header>
      <div className="nx-sheet-body">
        <div className="nx-form-card">
          <h3 style={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}>{shown.title}</h3>
          <p><Clock size={15} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />{describe(startMs, timeZone)} – {describe(endMs, timeZone)}</p>
          <p className="nx-hint">{timeZone}{fallback.allDay ? ' · All-day / continuing appointment' : ''}</p>
          {shown.location && <p><MapPin size={15} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />{shown.location}</p>}
          {shown.notes && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{shown.notes}</p>}
          {!event && !loadFailed && <p className="nx-hint" role="status">Loading details…</p>}
          {loadFailed && <p className="nx-hint">Showing what the calendar has. Details could not be loaded.</p>}
          {event && !editable && <p className="nx-hint">This appointment comes from a connected calendar. Edit it there.</p>}
        </div>
        {confirming && <p role="alert" className="nx-sheet-error">Delete this event? It is also removed from a connected calendar it was sent to. This can’t be undone.</p>}
        {error && <p role="alert" className="nx-sheet-error">{error}</p>}
      </div>
      {editable && <footer className="nx-sheet-foot">
        {confirming
          ? <><button type="button" className="nx-secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep</button><button type="button" className="nx-primary nx-danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete event'}</button></>
          : <><button type="button" className="nx-secondary" aria-label="Delete event" onClick={() => setConfirming(true)}><Trash2 size={18} aria-hidden="true" /></button><button type="button" className="nx-primary" onClick={() => setEditing(true)}>Edit Event</button></>}
      </footer>}
    </div>
  </dialog>;
}
