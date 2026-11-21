'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Folder as FolderIcon, FolderX, ListChecks, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Trash2, XCircle } from 'lucide-react';
import { isDone, parseServerDate, standardContains } from '@/lib/task-query';
import { FOLDER_COLOR_NAMES, FOLDER_PALETTE, FOLDER_SORTS, folderProgress, folderResults, folderTasks, NO_FOLDER_NAME, validFolderName, type Folder, type FolderSort } from '@/lib/task-list';

type FolderTask = { id: string; title: string; status: string; priority: string; critical?: boolean; durationMin: number; startAt?: string | null; dueAt?: string | null; projectId?: string | null };

function FolderBadge({ color }: { color?: string }) {
  return <span className="nx-folder-badge" style={color ? ({ '--folder': color } as React.CSSProperties) : undefined} aria-hidden="true"><FolderIcon size={22} strokeWidth={2.4} /></span>;
}

function SearchField({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (value: string) => void }) {
  return <label className="nx-search">
    <Search size={18} aria-hidden="true" />
    <input type="search" autoComplete="off" autoCorrect="off" placeholder={placeholder} aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    {value && <button type="button" aria-label="Clear search" onClick={() => onChange('')}><XCircle size={18} aria-hidden="true" /></button>}
  </label>;
}

/** The Folders tab (`ProjectsView`): search, sort, the folder grid and No Named Folder. */
export function FolderList({ folders, tasks, loaded, error, onRetry, onOpen, onChanged }: {
  folders: Folder[];
  tasks: FolderTask[];
  loaded: boolean;
  error: string;
  onRetry: () => void;
  onOpen: (folderId: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<FolderSort>('Recently updated');
  const [adding, setAdding] = useState(false);
  const visible = useMemo(() => folderResults(folders, search, sort), [folders, search, sort]);
  const showNone = loaded && (!search.trim() || standardContains(NO_FOLDER_NAME, search.trim()));
  const unassigned = tasks.filter((task) => (task.projectId ?? null) === null && task.status !== 'CANCELLED');

  return <div role="tabpanel" aria-label="Folders">
    <div className="nx-folder-tools">
      <SearchField placeholder="Search Folders" value={search} onChange={setSearch} />
      <span className="nx-sort"><SlidersHorizontal size={20} aria-hidden="true" /><select aria-label="Sort folders" value={sort} onChange={(event) => setSort(event.target.value as FolderSort)}>{FOLDER_SORTS.map((value) => <option key={value}>{value}</option>)}</select></span>
    </div>
    <div className="nx-folder-title"><h2>Folders</h2><button type="button" className="nx-text-button" onClick={() => setAdding(true)}><Plus size={17} aria-hidden="true" />New Folder</button></div>
    {!loaded && !error && <p role="status" className="nx-status">Loading folders…</p>}
    {error && <p role="alert" className="nx-error">{error}{loaded && ' Showing saved folders.'}<button type="button" onClick={onRetry}>Retry</button></p>}
    {loaded && !visible.length && !(search.trim() && showNone) && <div className="nx-status">{search.trim() ? <FolderIcon size={38} aria-hidden="true" /> : <Image src="/tasks/folders.webp" alt="" width={150} height={118} className="tk-empty-art" />}<h2>{search.trim() ? 'No matching folders' : 'Organize your tasks'}</h2><p>{search.trim() ? 'Try a different folder name.' : 'Create a folder to keep related tasks together.'}</p></div>}
    {visible.length > 0 && <div className="nx-folder-grid">{visible.map((folder) => <button key={folder.id} type="button" className="nx-folder-card" style={{ '--folder': folder.color } as React.CSSProperties} onClick={() => onOpen(folder.id)} aria-label={`${folder.name}. Open: ${Math.max(0, folder.totalTaskCount - folder.completedTaskCount)}, Done: ${folder.completedTaskCount}. Opens folder tasks`}>
      <span><FolderBadge color={folder.color} /><ChevronRight size={16} aria-hidden="true" /></span>
      <strong>{folder.name}</strong>
      <small>{`Open: ${Math.max(0, folder.totalTaskCount - folder.completedTaskCount)}   Done: ${folder.completedTaskCount}`}</small>
      <progress max={1} value={folderProgress(folder)} aria-label={`${folder.completedTaskCount} of ${folder.totalTaskCount} tasks completed`} />
    </button>)}</div>}
    {showNone && <button type="button" className="nx-folder-none" onClick={() => onOpen(null)} aria-label={`${NO_FOLDER_NAME}. Opens unassigned tasks`}>
      <FolderBadge />
      <span><strong>{NO_FOLDER_NAME}</strong><small>{`Open: ${unassigned.filter((task) => !isDone(task)).length}   Done: ${unassigned.filter(isDone).length}`}</small></span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>}
    {adding && <FolderEditor folder={null} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await onChanged(); }} />}
  </div>;
}

/** One folder's tasks (`ProjectDetailView`). `folderId` null is No Named Folder. */
export function FolderDetail({ folderId, folders, foldersLoaded, tasks, tasksLoading, timeZone, onBack, onOpenTask, onAddTask, onChanged }: {
  folderId: string | null;
  folders: Folder[];
  foldersLoaded: boolean;
  tasks: FolderTask[];
  tasksLoading: boolean;
  timeZone: string;
  onBack: () => void;
  onOpenTask: (id: string) => void;
  onAddTask: (folderId: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  // Folders open to actionable work; completed tasks stay available through the status filter.
  const [status, setStatus] = useState<'All' | 'Open' | 'Completed'>('Open');
  const [priority, setPriority] = useState('All');
  const [filtering, setFiltering] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const folder = folders.find((item) => item.id === folderId) ?? null;
  const missing = folderId !== null && foldersLoaded && !folder;
  const name = folder?.name ?? NO_FOLDER_NAME;
  const shown = useMemo(() => folderTasks(tasks, folderId, search, status, priority), [tasks, folderId, search, status, priority]);
  const untouched = !search.trim() && status === 'Open' && priority === 'All';

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(event.target instanceof Element && event.target.closest('.nx-menu'))) setMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menu]);

  async function remove() {
    if (!folder || deleting) return;
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${folder.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Couldn’t delete this folder. Please try again.');
      setConfirming(false);
      await onChanged();
      onBack();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t delete this folder. Please try again.');
      setConfirming(false);
    } finally { setDeleting(false); }
  }

  function subtitle(task: FolderTask) {
    const at = parseServerDate(task.startAt ?? task.dueAt);
    const day = at === null ? '' : ` · ${new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))}`;
    return `${task.durationMin} min${day}`;
  }

  return <div role="tabpanel" aria-label={name} style={folder ? ({ '--folder': folder.color } as React.CSSProperties) : undefined}>
    <button type="button" className="nx-back" onClick={onBack}><ChevronLeft size={18} aria-hidden="true" />Folders</button>
    <div className="nx-detail-head">
      <FolderBadge color={folder?.color} />
      <h2>{name}</h2>
      <button type="button" className="nx-icon-button" aria-label={`Add task to ${name}`} disabled={deleting || missing} onClick={() => onAddTask(folderId)}><Plus size={22} aria-hidden="true" /></button>
      <div className="nx-menu">
        <button type="button" className="nx-icon-button" aria-label="Folder actions" aria-haspopup="menu" aria-expanded={menu} disabled={deleting || missing} onClick={() => setMenu((open) => !open)}><MoreHorizontal size={22} aria-hidden="true" /></button>
        {menu && <div className="nx-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onAddTask(folderId); }}><Plus size={18} aria-hidden="true" />Add task</button>
          {folder && <button type="button" role="menuitem" onClick={() => { setMenu(false); setEditing(true); }}><Pencil size={18} aria-hidden="true" />Edit folder</button>}
          {folder && <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(false); setConfirming(true); }}><Trash2 size={18} aria-hidden="true" />Delete folder</button>}
        </div>}
      </div>
    </div>
    <div className="nx-folder-tools">
      <SearchField placeholder="Search tasks" value={search} onChange={setSearch} />
      <button type="button" className="nx-sort" aria-label="Filter folder tasks" aria-expanded={filtering} onClick={() => setFiltering((open) => !open)}><SlidersHorizontal size={20} aria-hidden="true" /></button>
    </div>
    {filtering && <div className="nx-form-card" style={{ marginTop: 12 }}>
      <label className="nx-form-row">Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{['All', 'Open', 'Completed'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="nx-form-row">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}>{['All', 'LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value === 'All' ? value : value[0] + value.slice(1).toLowerCase()}</option>)}</select></label>
      <button type="button" className="nx-text-button" onClick={() => { setStatus('Open'); setPriority('All'); }}>Reset filters</button>
    </div>}
    {error && <p role="alert" className="nx-error">{error}</p>}
    {deleting && <p role="status" className="nx-status">Deleting folder…</p>}
    {tasksLoading && !tasks.length ? <p role="status" className="nx-status">Loading tasks…</p>
      : missing ? <div className="nx-status"><FolderX size={38} aria-hidden="true" /><h2>Folder unavailable</h2><p>This folder may have been deleted.</p></div>
      : <>
        {shown.length > 0 && <p className="nx-count">{shown.length} {shown.length === 1 ? 'task' : 'tasks'}</p>}
        {!shown.length && <>
          <div className="nx-status" style={{ minHeight: 220, display: 'grid', alignContent: 'center' }}><ListChecks size={38} aria-hidden="true" /><p style={{ fontSize: 20 }}>{untouched ? 'You don’t have any open tasks.' : 'No matching tasks'}</p></div>
          <button type="button" className="nx-fill-button" aria-label={`Add task to ${folder?.name ?? 'folder'}`} onClick={() => onAddTask(folderId)}>Add task</button>
        </>}
        <div className="nx-rows">{shown.map((task) => <button key={task.id} type="button" className={`nx-folder-row ${isDone(task) ? 'is-done' : ''}`} onClick={() => onOpenTask(task.id)} aria-label={`${task.title}. Opens task details`}>
          {isDone(task) ? <CheckCircle2 size={24} aria-hidden="true" /> : <Circle size={24} aria-hidden="true" />}
          <span>
            <span className="nx-row-title">{task.title}</span>
            {(task.critical || task.priority === 'CRITICAL') && <span className="nx-row-critical">Critical</span>}
            <span className="nx-row-sub">{subtitle(task)}</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>)}</div>
      </>}
    {editing && folder && <FolderEditor folder={folder} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await onChanged(); }} />}
    {confirming && <ConfirmDialog title="Delete this folder?" message={`Its tasks will move to ${NO_FOLDER_NAME}. No tasks will be deleted.`} confirm="Delete folder" busy={deleting} onCancel={() => setConfirming(false)} onConfirm={() => void remove()} />}
  </div>;
}

/** New Folder / Edit Folder (`ProjectEditorView`): a name and one of six colours. */
function FolderEditor({ folder, onClose, onSaved }: { folder: Folder | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? FOLDER_PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const valid = validFolderName(name);
  const colors = [...new Set([...FOLDER_PALETTE, color])].sort();

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    if (!folder) input.current?.focus();
    return () => { element?.close(); opener?.focus(); };
  }, [folder]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !valid) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(folder ? `/api/projects/${folder.id}` : '/api/projects', { method: folder ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), color }) });
      if (!response.ok) throw new Error('Couldn’t save this folder. Please try again.');
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t save this folder. Please try again.');
      setSaving(false);
    }
  }

  return <dialog ref={dialog} className="nx-sheet" aria-labelledby="folder-editor-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={save} aria-busy={saving}>
      <header className="nx-sheet-head">
        <button type="button" className="nx-pill-button" disabled={saving} onClick={onClose}>Cancel</button>
        <h2 id="folder-editor-title">{folder ? 'Edit Folder' : 'New Folder'}</h2>
        <button type="submit" className="nx-pill-button" disabled={saving || !valid}>{saving ? 'Saving…' : 'Done'}</button>
      </header>
      <div className="nx-sheet-body">
        <div className="nx-form-card">
          <div>
            <label className="nx-label" htmlFor="folder-editor-name">FOLDER NAME</label>
            <input id="folder-editor-name" ref={input} className="nx-field" placeholder="Name" autoComplete="off" value={name} disabled={saving} onChange={(event) => setName(event.target.value)} />
            {name && !valid && <p className="nx-sheet-error">Use 1–80 characters, excluding surrounding spaces.</p>}
          </div>
          <hr />
          <div>
            <p className="nx-label">COLOR</p>
            <div className="nx-swatches" role="group" aria-label="Folder color">{colors.map((value) => <button key={value} type="button" aria-pressed={color === value} aria-label={FOLDER_COLOR_NAMES[value] ?? 'Custom color'} disabled={saving} onClick={() => setColor(value)}><span style={{ '--swatch': value } as React.CSSProperties}>{color === value && <Check size={20} strokeWidth={3} aria-hidden="true" />}</span></button>)}</div>
          </div>
        </div>
        {error && <p role="alert" className="nx-sheet-error">{error}</p>}
      </div>
    </form>
  </dialog>;
}

export function ConfirmDialog({ title, message, confirm, busy, onCancel, onConfirm }: { title: string; message: string; confirm: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="nx-sheet" aria-labelledby="nx-confirm-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="nx-confirm"><h2 id="nx-confirm-title">{title}</h2><p>{message}</p></div>
    <footer className="nx-sheet-foot">
      <button type="button" className="nx-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="nx-primary nx-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : confirm}</button>
    </footer>
  </dialog>;
}
