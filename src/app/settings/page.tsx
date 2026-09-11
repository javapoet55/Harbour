'use client';

import { useEffect, useState } from 'react';
import { Authed } from '@/components/authed';
import type { PreferenceForm } from '@/lib/types';
import { readCachedProfile, writeCachedProfile } from '@/lib/profile-cache';

type Connection = { id: string; provider: string; accountEmail: string; calendarName: string; visible: boolean; writeEnabled: boolean; status: string; lastSyncedAt: string | null };

export default function SettingsPage() {
  const [pref, setPref] = useState<PreferenceForm | null>(null);
  const [name, setName] = useState(() => readCachedProfile().name ?? '');
  const [nextAction, setNextAction] = useState({ enabled: false, switchingThreshold: 10 });
  const [timeZone, setTimeZone] = useState(() => readCachedProfile().timeZone ?? '');
  const [saved, setSaved] = useState(() => {
    if (typeof window === 'undefined') return '';
    const query = new URLSearchParams(window.location.search);
    const status = query.get('calendar');
    if (status?.endsWith('-connected')) return 'Calendar connected and synchronized.';
    if (status === 'error') return `Calendar connection failed: ${query.get('detail') || 'unknown error'}`;
    return '';
  });
  const [connections, setConnections] = useState<Connection[]>([]);
  const [defaultCalendarId, setDefaultCalendarId] = useState<string | null>(null);

  async function loadConnections() {
    const data = await fetch('/api/calendar/connections').then((r) => r.json());
    setConnections(data.connections ?? []); setDefaultCalendarId(data.defaultCalendarId ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPref(data.user?.preference ?? null);
        setName(data.user?.name ?? '');
        if (data.user?.nextAction) setNextAction(data.user.nextAction);
        setTimeZone(data.user?.timeZone ?? '');
      });
    fetch('/api/calendar/connections').then((r) => r.json()).then((data) => {
      if (!cancelled) { setConnections(data.connections ?? []); setDefaultCalendarId(data.defaultCalendarId ?? null); }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, timeZone, preference: pref, nextAction }),
    });
    if (!response.ok) { setSaved('Could not save settings. Please check your values and retry.'); return; }
    writeCachedProfile({ name, timeZone });
    window.dispatchEvent(new CustomEvent('harbor:profile-updated', { detail: { name, timeZone } }));
    window.dispatchEvent(new Event('harbor:tasks-updated'));
    setSaved('Saved. Relative dates now use this time zone.');
  }

  async function sync() {
    const res = await fetch('/api/calendar/sync', { method: 'POST' });
    const data = await res.json();
    setSaved(data.error ? `Calendar sync failed: ${data.error}` : `Calendar sync finished. ${data.results?.length ? `${data.results.reduce((sum: number, item: { created?: number; updated?: number; deleted?: number }) => sum + (item.created || 0) + (item.updated || 0) + (item.deleted || 0), 0)} changes processed.` : 'No connections.'}`);
    await loadConnections();
  }

  async function updateConnection(id: string, body: Record<string, unknown>) {
    await fetch('/api/calendar/connections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    await loadConnections();
  }

  async function disconnect(id: string) {
    await fetch(`/api/calendar/connections?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadConnections(); setSaved('Calendar disconnected. Imported events were removed with the connection.');
  }

  if (!pref) return <Authed><p>Loading settings…</p></Authed>;

  return (
    <Authed>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="harbor-card p-4">
          <h2 className="font-semibold">Profile and time</h2>
          <label className="mt-3 block text-sm">Display name
            <input className="harbor-input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
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
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <label className="flex items-start gap-2 text-sm">
              <input className="mt-1" type="checkbox" checked={pref.personalizationEnabled} onChange={(e) => setPref({ ...pref, personalizationEnabled: e.target.checked })} />
              <span><strong>Personalized predictions</strong><br /><span className="text-xs text-[var(--muted)]">Learn from task timing, completion, postponements, and reminder outcomes. Off by default.</span></span>
            </label>
            <button type="button" className="harbor-btn mt-3" onClick={async () => { await fetch('/api/insights', { method: 'DELETE' }); setSaved('Learned timing and prediction data erased.'); }}>Erase learned data</button>
          </div>
        </section>
        <section className="harbor-card p-4">
          <h2 className="font-semibold">Notifications</h2>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={nextAction.enabled} onChange={(e) => setNextAction({ ...nextAction, enabled: e.target.checked })} /><span><strong>Suggest my next action</strong><br />Show a quiet card on Today when a useful opening appears. No push alerts; respects work hours, quiet hours, and active focus.</span></label>
          <label className="mt-3 block text-sm">Protect my current focus<select className="harbor-input mt-1" value={nextAction.switchingThreshold} onChange={(e) => setNextAction({ ...nextAction, switchingThreshold: Number(e.target.value) })}><option value={5}>Flexible — allow meaningful improvements</option><option value={10}>Balanced — avoid small distractions</option><option value={25}>Strong — prefer continuing</option></select></label>
          <p className="mt-2 text-xs text-[var(--muted)]">Active timer state is stored only to protect your current focus. Timing history is learned only with Personalized predictions enabled.</p>
          {(['pushEnabled', 'emailEnabled', 'smsEnabled', 'morningSummary', 'eveningSummary'] as const).map((key) => (
            <label key={key} className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pref[key]} onChange={(e) => setPref({ ...pref, [key]: e.target.checked })} />
              {key.replace(/([A-Z])/g, ' $1')}
            </label>
          ))}
          <label className="mt-3 block text-sm">SMS phone number (E.164)
            <input className="harbor-input mt-1" placeholder="+15551234567" value={pref.phoneNumber ?? ''} onChange={(e) => setPref({ ...pref, phoneNumber: e.target.value || null })} />
          </label>
          <p className="mt-2 text-xs text-[var(--muted)]">Enable browser push and send delivery tests from Notification Center.</p>
        </section>
        <section className="harbor-card p-4">
          <h2 className="font-semibold">Calendars and privacy</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Connect a primary calendar with OAuth. Tokens are encrypted at rest and never sent to the browser.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="harbor-btn harbor-btn-brand" href="/api/calendar/oauth/google/start">Connect Google</a>
            <a className="harbor-btn harbor-btn-brand" href="/api/calendar/oauth/microsoft/start">Connect Outlook</a>
            <button type="button" className="harbor-btn" onClick={() => void sync()}>Synchronize now</button>
          </div>
          <div className="mt-4 space-y-3">
            {connections.map((connection) => (
              <div key={connection.id} className="rounded-xl border border-[var(--line)] p-3 text-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{connection.calendarName}</p><p className="text-xs text-[var(--muted)]">{connection.provider} · {connection.accountEmail} · {connection.status}</p></div><button className="text-xs text-red-700" type="button" onClick={() => void disconnect(connection.id)}>Disconnect</button></div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <label><input type="checkbox" checked={connection.visible} onChange={(e) => void updateConnection(connection.id, { visible: e.target.checked })} /> Visible</label>
                  <label><input type="checkbox" checked={connection.writeEnabled} onChange={(e) => void updateConnection(connection.id, { writeEnabled: e.target.checked })} /> Allow Nexdo writes</label>
                  <label><input type="radio" name="default-calendar" checked={defaultCalendarId === connection.id} onChange={() => void updateConnection(connection.id, { makeDefault: true })} /> Default</label>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">Export and account deletion are available from support in production. This demo account can be reset with <code>yarn db:reset</code>.</p>
          <a className="harbor-btn mt-3 inline-flex" href="/api/export" download="nexdo-export.json">Export my Nexdo data</a>
        </section>
      </div>
      <button type="button" className="harbor-btn harbor-btn-brand mt-4" onClick={() => void save()}>Save settings</button>
      {saved && <p className="mt-3 text-sm text-[var(--ok)]">{saved}</p>}
    </Authed>
  );
}
