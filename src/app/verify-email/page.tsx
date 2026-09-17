'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { NexdoLogo } from '@/components/nexdo-logo';

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const sendFailed = params.get('sent') === '0';
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState(params.get('code') || '');
  const [message, setMessage] = useState(sendFailed ? '' : params.get('reason') === 'unverified'
    ? 'Verify your email to sign in. Send a new code if you don’t have one from the last 24 hours.'
    : 'We sent a six-digit code to your inbox. It expires in 24 hours.');
  const [error, setError] = useState(sendFailed ? 'We couldn’t send your verification code. Send a new code to try again.' : '');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || 'Verification failed.');
        return;
      }
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/verify-email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || 'We couldn’t send a new code.');
        return;
      }
      if (body.developmentCode) setCode(body.developmentCode);
      setMessage(body.developmentCode ? `Your development code is ${body.developmentCode}.` : body.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <Link href="/welcome" className="nexdo-login-brand"><NexdoLogo priority /></Link>
      <h1 className="mt-2 text-3xl font-semibold">Verify your email</h1>
      <p className="mt-2 text-[var(--muted)]">Enter the six-digit code sent to your inbox.</p>
      <form onSubmit={submit} className="harbor-card mt-6 space-y-3 p-5">
        <label className="block text-sm font-medium">
          Email address
          <input className="harbor-input mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block text-sm font-medium">
          Verification code
          <input className="harbor-input mt-1" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </label>
        {message && <p className="text-sm text-[var(--ok)]" role="status">{message}</p>}
        {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
        <button className="harbor-btn harbor-btn-brand w-full" disabled={busy}>{busy ? 'Working…' : 'Verify email'}</button>
        <button type="button" className="w-full text-sm font-medium text-[var(--brand)] disabled:text-[var(--muted)]" disabled={busy || cooldown > 0 || !email} onClick={() => void resend()}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--brand)] hover:underline" href="/login">Back to sign in</Link></p>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5"><p>Loading…</p></main>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
