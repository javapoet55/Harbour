'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Bell, CheckCircle2, Mail, Pencil, Phone, Plus, Repeat, Search, Trash2, XCircle } from 'lucide-react';
import { standardContains } from '@/lib/task-query';

export type ReminderChannel = 'popup' | 'email' | 'call';
export type ReminderItem = {
  id: string; title: string; notes: string; at: string; done: boolean; status: string; recurring: boolean;
  channels: { channel: ReminderChannel; outcome: string }[];
};

const CHANNEL = {
  popup: { label: 'Pop-up', Icon: Bell },
  email: { label: 'Email', Icon: Mail },
  call: { label: 'Call', Icon: Phone },
} as const;
const OUTCOME: Record<string, { label: string; tone: 'wait' | 'good' | 'bad' | 'muted' }> = {
  scheduled: { label: 'Scheduled', tone: 'wait' },
  sending: { label: 'Pending', tone: 'wait' },
  sent: { label: 'Sent', tone: 'good' },
  answered: { label: 'Answered', tone: 'good' },
  voicemail: { label: 'Voicemail', tone: 'good' },
  missed: { label: 'Missed', tone: 'bad' },
  failed: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  skipped: { label: 'Not sent', tone: 'muted' },
};

/** The Reminders tab: upcoming reminders first, then the history, with how each pop-up, email and call went. */
export function RemindersPanel({ reminders, loaded, error, timeZone, now, onRetry, onEdit, onDelete, onNew }: {
  reminders: ReminderItem[]; loaded: boolean; error: string; timeZone: string; now: number;
  onRetry: () => void; onEdit: (reminder: ReminderItem) => void; onDelete: (reminder: ReminderItem) => void; onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim();
  const { upcoming, history } = useMemo(() => {
    const shown = reminders.filter((r) => !term || standardContains(r.title, term) || standardContains(r.notes, term));
    const isUpcoming = (r: ReminderItem) => !r.done && r.status !== 'CANCELLED' && Date.parse(r.at) > now;
    return {
      upcoming: shown.filter(isUpcoming).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
      history: shown.filter((r) => !isUpcoming(r)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    };
  }, [reminders, term, now]);
  const when = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const empty = loaded && !upcoming.length && !history.length;

  const row = (r: ReminderItem, past: boolean) => <li key={r.id} className={`tk-reminder-item${past ? ' is-past' : ''}`}>
    <button type="button" className="tk-reminder" onClick={() => onEdit(r)} aria-label={`${r.title}, ${when(r.at)}. Edit the reminder`}>
      <span className="tk-reminder-icon" aria-hidden="true">{r.done ? <CheckCircle2 size={20} /> : <Bell size={20} />}</span>
      <span className="tk-reminder-main">
        <strong>{r.title}</strong>
        {r.notes && <span className="tk-reminder-notes">{r.notes}</span>}
        <span className="tk-reminder-when">{when(r.at)}{r.recurring && <><span aria-hidden="true"> · </span><Repeat size={12} aria-hidden="true" />Repeats</>}{r.done && <><span aria-hidden="true"> · </span>Done</>}</span>
      </span>
      <span className="tk-reminder-channels">{r.channels.map(({ channel, outcome }) => {
        const { label, Icon } = CHANNEL[channel];
        const result = OUTCOME[outcome] ?? OUTCOME.skipped;
        return <span key={channel} className="tk-channel" data-tone={result.tone} title={`${label}: ${result.label}`}><Icon size={13} aria-hidden="true" />{label}<em>{result.label}</em></span>;
      })}</span>
    </button>
    <span className="tk-reminder-actions">
      <button type="button" aria-label={`Edit ${r.title}`} title="Edit" onClick={() => onEdit(r)}><Pencil size={17} aria-hidden="true" /></button>
      <button type="button" aria-label={`Delete ${r.title}`} title="Delete" className="is-danger" onClick={() => onDelete(r)}><Trash2 size={17} aria-hidden="true" /></button>
    </span>
  </li>;

  return <div role="tabpanel" aria-label="Reminders" className="tk-reminders">
    <div className="nx-folder-tools">
      <label className="nx-search"><Search size={18} aria-hidden="true" /><input type="search" autoComplete="off" placeholder="Search reminders" aria-label="Search reminders" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><XCircle size={18} aria-hidden="true" /></button>}</label>
    </div>
    <div className="nx-folder-title"><h2>Reminders</h2><button type="button" className="nx-text-button" onClick={onNew}><Plus size={17} aria-hidden="true" />New Reminder</button></div>
    {!loaded && !error && <p role="status" className="nx-status">Loading reminders…</p>}
    {error && <p role="alert" className="nx-error">{error}<button type="button" onClick={onRetry}>Retry</button></p>}
    {empty && <div className="nx-status">
      <Image src="/tasks/checklist.webp" alt="" width={160} height={123} className="tk-empty-art" />
      <h2>{term ? 'No matching reminders' : 'Never miss a moment'}</h2>
      <p>{term ? 'Try different words.' : 'Get a pop-up, an email or a call that reads the reminder to you.'}</p>
      {!term && <button type="button" className="nx-outline-button" onClick={onNew}><Plus size={17} aria-hidden="true" />Add New Reminder</button>}
    </div>}
    {upcoming.length > 0 && <section className="tk-reminder-group" aria-label="Upcoming reminders">
      <h3>Upcoming <span>{upcoming.length}</span></h3>
      <ul>{upcoming.map((r) => row(r, false))}</ul>
    </section>}
    {history.length > 0 && <section className="tk-reminder-group" aria-label="Reminder history">
      <h3>History <span>{history.length}</span></h3>
      <ul>{history.map((r) => row(r, true))}</ul>
    </section>}
  </div>;
}
