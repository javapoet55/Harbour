'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NexdoLogo } from '@/components/nexdo-logo';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || 'Could not request a reset code.'); return; }
      setSent(true); setMessage(body.developmentCode ? `Your development code is ${body.developmentCode}.` : body.message);
    } finally { setBusy(false); }
  }

  async function reset(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || 'Could not reset your password.'); return; }
      router.push('/login?reset=complete');
    } finally { setBusy(false); }
  }

  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
    <Link href="/welcome" className="nexdo-login-brand" aria-label="Nexdo home"><NexdoLogo priority /></Link>
    <h1 className="mt-2 text-3xl font-semibold">Reset your password</h1>
    <p className="mt-2 text-[var(--muted)]">We’ll help you get back to a clearer day.</p>
    <form onSubmit={sent ? reset : requestCode} className="harbor-card mt-6 space-y-3 p-5">
      <label className="block text-sm font-medium">Email address<input className="harbor-input mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      {sent && <>
        <label className="block text-sm font-medium">Verification code<input className="harbor-input mt-1" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <label className="block text-sm font-medium">New password<input className="harbor-input mt-1" type="password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
        <label className="block text-sm font-medium">Confirm new password<input className="harbor-input mt-1" type="password" minLength={12} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" /></label>
      </>}
      {message && <p className="text-sm text-[var(--ok)]" role="status">{message}</p>}
      {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
      <button className="harbor-btn harbor-btn-brand w-full" disabled={busy}>{busy ? 'Working…' : sent ? 'Set new password' : 'Send reset code'}</button>
      {sent && <button type="button" className="w-full text-sm font-medium text-[var(--brand)]" onClick={() => { setSent(false); setMessage(''); }}>Use a different email</button>}
    </form>
    <p className="mt-4 text-center text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--brand)] hover:underline" href="/login">Back to sign in</Link></p>
  </main>;
}
