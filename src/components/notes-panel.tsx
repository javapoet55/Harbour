'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Plus, Search, XCircle } from 'lucide-react';
import { standardContains } from '@/lib/task-query';
import type { Note } from './quick-add-sheets';

/** The Notes tab: every note, newest change first, searchable by title and text. */
export function NotesPanel({ notes, loaded, error, timeZone, onRetry, onOpen, onNew }: {
  notes: Note[]; loaded: boolean; error: string; timeZone: string; onRetry: () => void; onOpen: (note: Note) => void; onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim();
  const shown = useMemo(() => notes.filter((note) => !term || standardContains(note.title, term) || standardContains(note.body, term)), [notes, term]);
  const updated = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  return <div role="tabpanel" aria-label="Notes" className="tk-notes">
    <div className="nx-folder-tools">
      <label className="nx-search"><Search size={18} aria-hidden="true" /><input type="search" autoComplete="off" placeholder="Search notes" aria-label="Search notes" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><XCircle size={18} aria-hidden="true" /></button>}</label>
    </div>
    <div className="nx-folder-title"><h2>Notes</h2><button type="button" className="nx-text-button" onClick={onNew}><Plus size={17} aria-hidden="true" />New Note</button></div>
    {!loaded && !error && <p role="status" className="nx-status">Loading notes…</p>}
    {error && <p role="alert" className="nx-error">{error}<button type="button" onClick={onRetry}>Retry</button></p>}
    {loaded && !shown.length && <div className="nx-status">
      <Image src="/tasks/clipboard.webp" alt="" width={160} height={116} className="tk-empty-art" />
      <h2>{term ? 'No matching notes' : 'Keep a note'}</h2>
      <p>{term ? 'Try different words.' : 'Ideas, lists and details for later live here, next to your tasks.'}</p>
      {!term && <button type="button" className="nx-outline-button" onClick={onNew}>New Note</button>}
    </div>}
    {shown.length > 0 && <div className="tk-note-grid">{shown.map((note) => <button key={note.id} type="button" className="tk-note" onClick={() => onOpen(note)} aria-label={`${note.title || 'Untitled note'}. Opens the note`}>
      <strong>{note.title || 'Untitled note'}</strong>
      {note.body && <span>{note.body}</span>}
      <small>Edited {updated(note.updatedAt)}</small>
    </button>)}</div>}
  </div>;
}
