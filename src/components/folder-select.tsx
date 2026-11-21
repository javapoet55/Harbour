'use client';

import { useEffect, useState } from 'react';
import { folderResults, NO_FOLDER_NAME, type Folder } from '@/lib/task-list';

/**
 * The folder picker used when creating and editing a task (`ProjectAssignmentField` on the phone):
 * No Named Folder first, then the folders by name. Pass `folders` when the caller already has them;
 * otherwise the picker loads them itself.
 */
export function FolderSelect({ value, onChange, folders, className, disabled, id }: { value: string | null; onChange: (id: string | null) => void; folders?: Folder[]; className?: string; disabled?: boolean; id?: string }) {
  const [loaded, setLoaded] = useState<Folder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (folders) return;
    const controller = new AbortController();
    fetch('/api/projects', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('folders');
        const data = await response.json();
        if (!controller.signal.aborted) { setLoaded(Array.isArray(data.projects) ? data.projects : []); setFailed(false); }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [folders, attempt]);

  const options = folderResults(folders ?? loaded ?? [], '', 'Name');
  const known = value === null || options.some((folder) => folder.id === value);
  return <>
    <select id={id} className={className} aria-label="Folder" disabled={disabled} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{NO_FOLDER_NAME}</option>
      {!known && value && <option value={value}>Assigned folder</option>}
      {options.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
    </select>
    {!folders && failed && <p className="mt-1 text-xs text-[var(--muted)]">Couldn’t load folders. <button type="button" className="underline" onClick={() => setAttempt((count) => count + 1)}>Retry folders</button></p>}
  </>;
}
