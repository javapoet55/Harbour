'use client';

import { useEffect, useRef, useState } from 'react';
import { AlignLeft, ArrowRight, Calendar, ChevronDown, ChevronRight, Clock, Folder as FolderIcon, List, Mic, Minus, Plus } from 'lucide-react';
import { scheduleFetch } from '@/lib/schedule-fetch';
import { resolveCreationDate, spacedCreationStart, TASK_CREATION_DATES, ymdInZone, type Folder, type TaskCreationDate } from '@/lib/task-list';
import { FolderSelect } from './folder-select';

const COMMON_DURATIONS = [15, 30, 45, 60];

/**
 * "Create New Task", as on the phone (`TaskEditor.creationForm`, ios/App/RootView.swift): name, notes,
 * folder, a Today / Tomorrow / Select Date choice and a time estimate. The start is the chosen day at
 * the current clock time, moved to the first opening that leaves 15 minutes around existing tasks.
 */
export function TaskCreateSheet({ timeZone, tasks, folders, initialFolderId = null, onClose, onCreated, onVoice }: {
  timeZone: string;
  tasks: { status: string; startAt?: string | null; durationMin: number }[];
  folders: Folder[];
  initialFolderId?: string | null;
  onClose: () => void;
  onCreated: (title: string, scheduledAt: number) => void;
  onVoice?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const idempotencyKey = useRef('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [dateChoice, setDateChoice] = useState<TaskCreationDate>('Today');
  const [customDate, setCustomDate] = useState(() => ymdInZone(Date.now(), timeZone));
  const [duration, setDuration] = useState(30);
  const [customEstimate, setCustomEstimate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canSave = !saving && title.trim().length > 0;

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    nameInput.current?.focus();
    return () => { element?.close(); opener?.focus(); };
  }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    // One key per form, so a retry after a dropped response cannot create the task twice.
    idempotencyKey.current ||= crypto.randomUUID();
    const scheduledAt = spacedCreationStart(resolveCreationDate(dateChoice, customDate, timeZone), duration, tasks);
    try {
      const response = await scheduleFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), notes, durationMin: duration, startAt: new Date(scheduledAt).toISOString(), projectId: folderId, idempotencyKey: idempotencyKey.current }),
      });
      if (!response.ok) throw new Error('Couldn’t create your task. Please try again.');
      onCreated(title.trim(), scheduledAt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t create your task. Please try again.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const customLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${customDate}T12:00:00Z`));

  return <dialog ref={dialog} className="nx-sheet" aria-labelledby="task-create-title" onCancel={(event) => { event.preventDefault(); if (!submitting.current) onClose(); }}>
    <form onSubmit={create} aria-busy={saving}>
      <header className="nx-sheet-head">
        <button type="button" className="nx-pill-button" disabled={saving} onClick={onClose}>Close</button>
        <h2 id="task-create-title">Create New Task</h2>
        {onVoice ? <button type="button" className="nx-voice-button" aria-label="Add task by voice" disabled={saving} onClick={onVoice}><Mic size={22} aria-hidden="true" /></button> : <span />}
      </header>
      <div className="nx-sheet-body">
        <div className="nx-form-card">
          <div>
            <label className="nx-label" htmlFor="task-create-name"><List size={15} aria-hidden="true" />TASK NAME</label>
            <input id="task-create-name" ref={nameInput} className="nx-field nx-title-field" required maxLength={300} autoComplete="off" placeholder="What needs to get done?" value={title} disabled={saving} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <hr />
          <div>
            <button type="button" className="nx-notes-toggle" aria-expanded={notesOpen} aria-controls="task-create-notes" onClick={() => setNotesOpen((open) => !open)}>
              <span><span className="nx-label"><AlignLeft size={15} aria-hidden="true" />NOTES</span>{!notesOpen && <small>{notes || 'Add a note (optional)'}</small>}</span>
              {notesOpen ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
            </button>
            {notesOpen && <textarea id="task-create-notes" className="nx-field" rows={3} aria-label="Task notes" placeholder="Add context, links, or a definition of done…" value={notes} disabled={saving} onChange={(event) => setNotes(event.target.value)} />}
          </div>
          <hr />
          <div>
            <label className="nx-label" htmlFor="task-create-folder"><FolderIcon size={15} aria-hidden="true" />FOLDER</label>
            <FolderSelect id="task-create-folder" className="nx-field" value={folderId} onChange={setFolderId} folders={folders} disabled={saving} />
          </div>
          <hr />
          <div>
            <p className="nx-label"><Calendar size={15} aria-hidden="true" />DATE</p>
            <div className="nx-choice-row" role="group" aria-label="Task date">
              {TASK_CREATION_DATES.map((choice) => choice === 'Select Date'
                ? <label key={choice} data-selected={dateChoice === choice}>
                    {dateChoice === choice ? customLabel : choice}
                    <input type="date" aria-label="Select Date" value={customDate} disabled={saving} onClick={(event) => { setDateChoice(choice); try { event.currentTarget.showPicker?.(); } catch { /* Some browsers open the picker themselves. */ } }} onChange={(event) => { if (event.target.value) { setCustomDate(event.target.value); setDateChoice(choice); } }} />
                  </label>
                : <button key={choice} type="button" aria-pressed={dateChoice === choice} disabled={saving} onClick={() => setDateChoice(choice)}>{choice}</button>)}
            </div>
          </div>
          <hr />
          <div>
            <div className="nx-estimate-head">
              <p className="nx-label"><Clock size={15} aria-hidden="true" />TIME ESTIMATE</p>
              <button type="button" className="nx-text-button" style={{ color: '#3d29c7', fontSize: 13 }} aria-expanded={customEstimate} aria-label={`Custom estimate, ${duration} minutes`} onClick={() => setCustomEstimate((open) => !open)}>{COMMON_DURATIONS.includes(duration) ? 'Custom' : `${duration}m`}</button>
            </div>
            <div className="nx-choice-row" role="group" aria-label="Time estimate">
              {COMMON_DURATIONS.map((minutes) => <button key={minutes} type="button" aria-pressed={duration === minutes} aria-label={`${minutes} minutes`} disabled={saving} onClick={() => setDuration(minutes)}>{minutes}m</button>)}
            </div>
            {customEstimate && <div className="nx-stepper">
              <button type="button" aria-label="Five minutes less" disabled={saving || duration <= 5} onClick={() => setDuration((value) => Math.max(5, value - 5))}><Minus size={18} aria-hidden="true" /></button>
              <output aria-live="polite">{duration} minutes</output>
              <button type="button" aria-label="Five minutes more" disabled={saving || duration >= 480} onClick={() => setDuration((value) => Math.min(480, value + 5))}><Plus size={18} aria-hidden="true" /></button>
            </div>}
          </div>
        </div>
        {error && <p role="alert" className="nx-sheet-error">{error}</p>}
      </div>
      <footer className="nx-sheet-foot">
        <button type="submit" className="nx-primary" disabled={!canSave}>{saving ? 'Creating…' : <>Create Task<ArrowRight size={20} aria-hidden="true" /></>}</button>
      </footer>
    </form>
  </dialog>;
}
