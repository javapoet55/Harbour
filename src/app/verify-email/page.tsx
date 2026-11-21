'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Mail } from 'lucide-react';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '@/components/auth/auth-ui';

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
        body: JSON.stringify({ email, code, verificationProof: sessionStorage.getItem('nexdo-verification-proof') }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || 'Verification failed.');
        return;
      }
      sessionStorage.removeItem('nexdo-verification-proof');
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
    <>
      <h2>Enter your code</h2>
      <p className="au-panel-lede">It’s the six-digit code in the email we sent you.</p>
      <form onSubmit={submit} className="au-form">
        <AuthField label="Email address" icon={Mail} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        <AuthField label="Verification code" icon={KeyRound} code inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
        {message && <AuthAlert kind="ok">{message}</AuthAlert>}
        {error && <AuthAlert kind="error">{error}</AuthAlert>}
        <AuthButton type="submit" disabled={busy}>{busy ? 'Working…' : 'Verify email'}</AuthButton>
      </form>
      <div className="au-foot">
        <p className="au-note">Didn’t get it? <button type="button" className="au-link" disabled={busy || cooldown > 0 || !email} onClick={() => void resend()}>{cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}</button></p>
        <p className="au-note"><Link className="au-link" href="/login">Back to login</Link> · <Link className="au-link" href="/reset-password">Reset password</Link></p>
      </div>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell
      scene="reset"
      aside={<>
        <h1>Verify your <span>email</span></h1>
        <p className="au-lede">One quick step so we know it’s really you. Then your day is ready.</p>
      </>}
    >
      {/* useSearchParams needs a Suspense boundary. */}
      <Suspense fallback={<h2>Enter your code</h2>}><VerifyEmailForm /></Suspense>
    </AuthShell>
  );
}
