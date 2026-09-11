'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NexdoLogo } from '@/components/nexdo-logo';

export default function OnboardingPage() {
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles');
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [reminders, setReminders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeZone, preference: { workStart, workEnd, pushEnabled: reminders } }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.error || 'Could not save your preferences.'); return; }
      window.localStorage.setItem('nexdo:onboarding-complete', '1'); router.push('/'); router.refresh();
    } finally { setBusy(false); }
  }

  return <main className="mx-auto flex min-h-screen max-w-2xl items-center px-5 py-10"><div className="w-full"><NexdoLogo priority /><p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">A few thoughtful defaults</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Let Nexdo fit your day.</h1><p className="mt-3 max-w-xl text-lg leading-8 text-[var(--muted)]">These settings help your AI companion plan around your real availability. You can change everything later in Settings.</p><form onSubmit={submit} className="harbor-card mt-7 grid gap-5 p-5 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Time zone<input className="harbor-input mt-1" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required /></label><label className="text-sm font-medium">Workday starts<input className="harbor-input mt-1" type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} required /></label><label className="text-sm font-medium">Workday ends<input className="harbor-input mt-1" type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} required /></label><label className="flex items-start gap-3 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} /><span><strong>Enable browser reminders</strong><br /><span className="text-[var(--muted)]">Nexdo will keep reminders useful and respect your quiet hours.</span></span></label>{error && <p className="text-sm text-[var(--danger)] sm:col-span-2" role="alert">{error}</p>}<button className="harbor-btn harbor-btn-brand sm:col-span-2" disabled={busy}>{busy ? 'Saving…' : 'Finish setup'}</button></form></div></main>;
}
