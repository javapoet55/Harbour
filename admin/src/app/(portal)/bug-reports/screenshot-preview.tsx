'use client';

import { useRef, useState } from 'react';

export function ScreenshotPreview({ id, reference }: { id: string; reference: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  return <>
    <button className="admin-bug-action" type="button" onClick={() => {
      setFailed(false);
      setOpen(true);
      dialog.current?.showModal();
    }}>View screenshot</button>
    <dialog ref={dialog} className="admin-bug-preview" aria-label={`Screenshot for ${reference}`} onClose={() => setOpen(false)}>
      <header><strong>{reference} screenshot</strong>
        <form method="dialog"><button className="admin-bug-action">Close</button></form>
      </header>
      {open && (failed ? <p role="status">This screenshot could not be loaded. It may have expired.</p>
        // This authenticated image must be requested directly by the user's browser.
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={`/api/admin/feedback/bugs/${id}/screenshot`} alt={`Screenshot attached to ${reference}`} onError={() => setFailed(true)}/>)}
    </dialog>
  </>;
}
