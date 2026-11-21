'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordInput } from './password-input';
import { BUG_MAX, bugIssue, canDeleteAccount, DELETE_WORD, passwordIssue, webBugReport, type BugReportRow } from '@/lib/account-safety';

async function errorText(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' && body.error ? body.error : fallback;
}

/** Changing the password signs out every device, this one included, so it ends at the sign-in page. */
export function ChangePasswordCard() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const issue = passwordIssue(current, next, confirm);
    if (issue) { setError(issue); return; }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }) });
      if (!response.ok) { setError(await errorText(response, 'Your password could not be changed. Please try again.')); return; }
      router.push('/login');
      router.refresh();
    } catch {
      setError('Your password could not be changed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="harbor-card p-4" aria-labelledby="acct-password-title">
    <h2 id="acct-password-title" className="font-semibold">Change password</h2>
    <form onSubmit={submit} aria-busy={busy}>
      <label className="mt-3 block text-sm">Current password<PasswordInput autoComplete="current-password" value={current} disabled={busy} onChange={(event) => setCurrent(event.target.value)} /></label>
      <label className="mt-3 block text-sm">New password<PasswordInput autoComplete="new-password" value={next} disabled={busy} onChange={(event) => setNext(event.target.value)} /></label>
      <label className="mt-3 block text-sm">Confirm new password<PasswordInput autoComplete="new-password" value={confirm} disabled={busy} onChange={(event) => setConfirm(event.target.value)} /></label>
      <p className="mt-2 text-xs text-[var(--muted)]">You’ll be signed out of Nexdo on every browser and phone, then sign in with the new password.</p>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" className="harbor-btn harbor-btn-brand mt-3" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
    </form>
  </section>;
}

/** Report a bug: a description only (no screenshot on the web), and the reports sent in the last 90 days. */
export function ReportBugCard() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [reports, setReports] = useState<BugReportRow[]>([]);
  const [historyError, setHistoryError] = useState('');
  // One id per report, so a retry after a lost answer is the same report and not a second one.
  const key = useRef<{ id: string; correlation: string } | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/feedback/bugs?status=open', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { reports: BugReportRow[] };
      setReports(body.reports);
      setHistoryError('');
    } catch {
      setHistoryError('Your earlier reports could not be loaded.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, [loadHistory]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const issue = bugIssue(text);
    if (issue) { setError(issue); return; }
    setBusy(true);
    setError('');
    setSent('');
    key.current ??= { id: crypto.randomUUID(), correlation: crypto.randomUUID() };
    try {
      const response = await fetch('/api/feedback/bugs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(webBugReport(text, key.current.id, key.current.correlation, Date.now())) });
      if (!response.ok) { setError(await errorText(response, 'Your report could not be sent. Please try again.')); return; }
      const body = (await response.json()) as { reference: string };
      setSent(body.reference);
      setText('');
      key.current = null;
      void loadHistory();
    } catch {
      setError('Your report could not be sent. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="harbor-card p-4" aria-labelledby="acct-bug-title">
    <h2 id="acct-bug-title" className="font-semibold">Report a bug</h2>
    <form onSubmit={submit} aria-busy={busy}>
      <label className="mt-3 block text-sm">What went wrong?
        <textarea className="harbor-input mt-1 min-h-28" maxLength={BUG_MAX} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} />
      </label>
      <p className="mt-1 text-xs text-[var(--muted)]">{text.length.toLocaleString('en-US')} / {BUG_MAX.toLocaleString('en-US')}. Don’t include passwords. Reports are kept 90 days.</p>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      {sent && <p role="status" className="mt-2 text-sm text-[var(--ok)]">Thanks. Your report is {sent}.</p>}
      <button type="submit" className="harbor-btn harbor-btn-brand mt-3" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
    </form>
    {historyError && <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{historyError}</p>}
    {reports.length > 0 && <div className="mt-4 border-t border-[var(--line)] pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Open reports</p>
      <ul className="mt-2 space-y-2 text-sm">
        {reports.map((report) => <li key={report.id}><strong>{report.reference}</strong> <span className="text-xs text-[var(--muted)]">{new Date(report.createdAt).toLocaleDateString()}</span><br /><span className="line-clamp-2">{report.description}</span></li>)}
      </ul>
    </div>}
  </section>;
}

/** Permanent. Needs the word DELETE; the server removes the account and its data and ends the session. */
export function DeleteAccountCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !canDeleteAccount(typed)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account', { method: 'DELETE' });
      if (!response.ok) { setError(await errorText(response, 'Your account could not be deleted. Please try again.')); return; }
      router.push('/login');
      router.refresh();
    } catch {
      setError('Your account could not be deleted. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="harbor-card p-4" aria-labelledby="acct-delete-title">
    <h2 id="acct-delete-title" className="font-semibold">Delete account</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Permanently deletes your account and everything in it: tasks, folders, notes, shopping lists and connections. This cannot be undone. Export your data first if you want a copy.</p>
    {!open ? <button type="button" className="harbor-btn mt-3" onClick={() => setOpen(true)}>Delete my account…</button> : <form onSubmit={remove} aria-busy={busy}>
      <label className="mt-3 block text-sm">Type {DELETE_WORD} to confirm
        <input className="harbor-input mt-1" autoComplete="off" value={typed} disabled={busy} onChange={(event) => setTyped(event.target.value)} />
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" className="harbor-btn" disabled={busy} onClick={() => { setOpen(false); setTyped(''); setError(''); }}>Cancel</button>
        <button type="submit" className="harbor-btn" style={{ color: '#fff', background: 'var(--danger)' }} disabled={busy || !canDeleteAccount(typed)}>{busy ? 'Deleting…' : 'Delete everything'}</button>
      </div>
    </form>}
  </section>;
}
