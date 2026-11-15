"use client";

import { useState, useTransition } from 'react';
import { bugStatusLabels, bugStatuses, type BugStatus } from './bug-status';

export function BugStatusSelect({ reference, status, saveAction }: {
  reference: string;
  status: BugStatus;
  saveAction: (status: BugStatus) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(status);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function change(next: BugStatus) {
    const previous = selected;
    setSelected(next);
    setFailed(false);
    startTransition(async () => {
      let saved = false;
      try {
        saved = await saveAction(next);
      } catch {
        // A transport failure has the same recovery as a rejected save.
      }
      if (!saved) {
        setSelected(previous);
        setFailed(true);
      }
    });
  }

  return <>
    <select className="admin-bug-status" aria-label={`Status for ${reference}`} value={selected} disabled={pending}
      onChange={event => change(event.currentTarget.value as BugStatus)}>
      {bugStatuses.map(value => <option key={value} value={value}>{bugStatusLabels[value]}</option>)}
    </select>
    {pending && <small role="status">Saving…</small>}
    {failed && <small className="admin-bug-status-error" role="alert">Couldn’t save status. Try again.</small>}
  </>;
}
