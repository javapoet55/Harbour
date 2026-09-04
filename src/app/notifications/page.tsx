'use client';

import { useEffect, useState } from 'react';
import { Authed } from '@/components/authed';
import type { ReminderRow } from '@/lib/types';

export default function NotificationsPage() {
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [message, setMessage] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && window.Notification ? window.Notification.permission : 'unsupported',
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notifications')
      .then((res) => res.json())
      .then((data: { reminders?: ReminderRow[] }) => {
        if (!cancelled) setReminders(data.reminders ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: string, reminderId?: string) {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reminderId }),
    });
    const data = await res.json();
    setMessage(data.message || 'Updated.');
    const next = await fetch('/api/notifications');
    const payload = await next.json();
    setReminders(payload.reminders ?? []);
  }

  function decodeKey(value: string) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob((value + padding).replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
  }

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !window.Notification) return setMessage('Push is not supported in this browser.');
    const config = await fetch('/api/push-subscriptions').then((r) => r.json());
    if (!config.publicKey) return setMessage('VAPID keys are not configured on the server.');
    const granted = await Notification.requestPermission();
    setPermission(granted);
    if (granted !== 'granted') return setMessage('Notification permission was not granted.');
    const registration = await navigator.serviceWorker.register('/sw.js');
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(config.publicKey) });
    const response = await fetch('/api/push-subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) });
    setMessage(response.ok ? 'Push notifications enabled on this device.' : 'Could not save the push subscription.');
  }

  async function test(channel: 'push' | 'email' | 'sms') {
    const res = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', channel }) });
    const data = await res.json(); setMessage(data.message || 'Test finished.');
  }

  return (
    <Authed>
      <h1 className="text-3xl font-semibold">Notification Center</h1>
      <p className="mt-2 text-[var(--muted)]">Every reminder has a recorded status. Harbor does not need this tab to be open — the job ticker records delivery independently.</p>
      {permission !== 'granted' && permission !== 'unsupported' && (
        <p className="mt-3 rounded-xl bg-[#faeeda] px-4 py-3 text-sm">Browser notifications are {permission}. Enable them in your browser settings to receive push on this device.</p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" className="harbor-btn harbor-btn-brand" onClick={() => void enablePush()}>Enable push</button>
        <button type="button" className="harbor-btn" onClick={() => void test('push')}>Test push</button>
        <button type="button" className="harbor-btn" onClick={() => void test('email')}>Test email</button>
        <button type="button" className="harbor-btn" onClick={() => void test('sms')}>Test SMS</button>
        <button type="button" className="harbor-btn" onClick={() => void run('tick')}>Run reminder ticker</button>
      </div>
      {message && <p className="mt-3 text-sm text-[var(--ok)]">{message}</p>}
      <div className="mt-6 space-y-3">
        {reminders.map((reminder) => (
          <article key={reminder.id} className="harbor-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{reminder.task?.title ?? 'Reminder'}</p>
                <p className="text-xs uppercase tracking-wide text-[var(--faint)]">{reminder.offsetLabel} · {reminder.status}</p>
              </div>
              <button type="button" className="harbor-btn" onClick={() => void run('ack', reminder.id)}>Acknowledge</button>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              {reminder.attempts.map((attempt) => (
                <li key={attempt.id}>{attempt.channel}: {attempt.status}{attempt.failureReason ? ` — ${attempt.failureReason}` : ''}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Authed>
  );
}
