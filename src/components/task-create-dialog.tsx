'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { tzToday, ymd } from '@/lib/time';
import './task-create-dialog.css';

export function TaskCreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (title: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [timeZone, setTimeZone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    nameInput.current?.focus();
    return () => { element?.close(); opener?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/me', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load your time zone.');
      const payload = await response.json();
      const zone = payload.user?.timeZone;
      if (!zone) throw new Error('Could not load your time zone.');
      if (!controller.signal.aborted) {
        setDate(ymd(tzToday(zone)));
        setTimeZone(zone);
        setError('');
      }
    }).catch(() => { if (!controller.signal.aborted) setError('Could not load your time zone. Please try again.'); });
    return () => controller.abort();
  }, [retry]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !date || !time || !timeZone || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), date, time, durationMin: 30, status: 'PLANNED' }),
      });
      if (!response.ok) throw new Error('Could not add your task. Please try again.');
      onCreated(title.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add your task.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return <dialog ref={dialog} className="task-create-dialog" aria-labelledby="task-create-title" onCancel={(event) => { event.preventDefault(); if (!submitting.current) onClose(); }}>
    <form onSubmit={create} aria-busy={saving}>
      <header><h2 id="task-create-title">Add a new task</h2><button type="button" aria-label="Close new task" disabled={saving} onClick={onClose}><X size={22} aria-hidden="true" /></button></header>
      <label>Task name<input ref={nameInput} required maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} autoComplete="off" /></label>
      <label>Date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={saving || !timeZone} /></label>
      <label>Time<input required type="time" value={time} onChange={(event) => setTime(event.target.value)} disabled={saving || !timeZone} /></label>
      <p>{timeZone ? `30 minutes · ${timeZone}. Your new task will appear in Tasks and on its calendar date.` : 'Loading your time zone…'}</p>
      {error && <p role="alert" className="task-create-error">{error}{!timeZone && <button type="button" onClick={() => { setError(''); setRetry((value) => value + 1); }}>Try again</button>}</p>}
      <button className="harbor-btn harbor-btn-brand" type="submit" disabled={saving || !title.trim() || !date || !time || !timeZone}>{saving ? 'Adding…' : 'Add task'}</button>
    </form>
  </dialog>;
}
