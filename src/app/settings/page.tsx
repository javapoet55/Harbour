'use client';

import { useEffect, useState } from 'react';
import { Authed } from '@/components/authed';
import type { PreferenceForm } from '@/lib/types';

export default function SettingsPage() {
  const [pref, setPref] = useState<PreferenceForm | null>(null);
  const [timeZone, setTimeZone] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPref(data.user?.preference ?? null);
        setTimeZone(data.user?.timeZone ?? '');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeZone, preference: pref }),
    });
    setSaved('Saved. Relative dates now use this time zone.');
  }

  async function sync() {
    const res = await fetch('/api/calendar/sync', { method: 'POST' });
    const data = await res.json();
    setSaved(`Calendar sync finished. ${data.results?.[0] ? 'Last synchronized just now.' : 'No connections.'}`);
  }

  if (!pref) return <Authed><p>Loading settings…</p></Authed>;

  return (
    <Authed>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="harbor-card p-4">
          <h2 className="font-semibold">Profile and time</h2>
          <label className="mt-3 block text-sm">Time zone
            <input className="harbor-input mt-1" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
          </label>
          <label className="mt-3 block text-sm">Working hours
            <div className="mt-1 flex gap-2">
              <input className="harbor-input" value={pref.workStart} onChange={(e) => setPref({ ...pref, workStart: e.target.value })} />
              <input className="harbor-input" value={pref.workEnd} onChange={(e) => setPref({ ...pref, workEnd: e.target.value })} />
            </div>
          </label>
          <label className="mt-3 block text-sm">Quiet hours
            <div className="mt-1 flex gap-2">
              <input className="harbor-input" value={pref.quietStart} onChange={(e) => setPref({ ...pref, quietStart: e.target.value })} />
              <input className="harbor-input" value={pref.quietEnd} onChange={(e) => setPref({ ...pref, quietEnd: e.target.value })} />
            </div>
          </label>
        </section>
        <section className="harbor-card p-4">
          <h2 className="font-semibold">Voice and confirmation</h2>
          <label className="mt-3 block text-sm">AI confirmation
            <select className="harbor-input mt-1" value={pref.confirmationLevel} onChange={(e) => setPref({ ...pref, confirmationLevel: e.target.value })}>
              <option value="ALWAYS">Always confirm</option>
              <option value="CHANGES_AND_DELETES">Confirm changes and deletions</option>
              <option value="ROUTINE_AUTO">Execute routine actions</option>
            </select>
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pref.voiceEnabled} onChange={(e) => setPref({ ...pref, voiceEnabled: e.target.checked })} />
            Enable spoken replies
          </label>
          <p className="mt-2 text-xs text-[var(--muted)]">Transcripts are kept {pref.transcriptRetentionDays} days. Raw audio is not stored in this MVP.</p>
        </section>
        <section className="harbor-card p-4">
          <h2 className="font-semibold">Notifications</h2>
          {(['pushEnabled', 'emailEnabled', 'smsEnabled', 'morningSummary', 'eveningSummary'] as const).map((key) => (
            <label key={key} className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pref[key]} onChange={(e) => setPref({ ...pref, [key]: e.target.checked })} />
              {key.replace(/([A-Z])/g, ' $1')}
            </label>
          ))}
        </section>
        <section className="harbor-card p-4">
          <h2 className="font-semibold">Calendars and privacy</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Google and Outlook use provider interfaces. Without client IDs, Harbor syncs the local mock calendar and records last-synced time.</p>
          <button type="button" className="harbor-btn mt-3" onClick={() => void sync()}>Synchronize calendars</button>
          <p className="mt-3 text-xs text-[var(--muted)]">Export and account deletion are available from support in production. This demo account can be reset with <code>yarn db:reset</code>.</p>
        </section>
      </div>
      <button type="button" className="harbor-btn harbor-btn-brand mt-4" onClick={() => void save()}>Save settings</button>
      {saved && <p className="mt-3 text-sm text-[var(--ok)]">{saved}</p>}
    </Authed>
  );
}
