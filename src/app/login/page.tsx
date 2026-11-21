'use client';

import { FormEvent, Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail } from 'lucide-react';
import { AuthAlert, AuthButton, AuthField, AuthPassword, AuthShell } from '@/components/auth/auth-ui';

function LoginForm() {
  const router = useRouter();
  const passwordWasReset = useSearchParams().get('reset') === 'complete';
  const [email, setEmail] = useState(process.env.NODE_ENV === 'production' ? '' : 'alex@harbor.app');
  const [password, setPassword] = useState(process.env.NODE_ENV === 'production' ? '' : 'harbor-demo');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === 'EMAIL_NOT_VERIFIED') {
          if (typeof body.verificationProof === 'string') sessionStorage.setItem('nexdo-verification-proof', body.verificationProof);
          router.push(`/verify-email?email=${encodeURIComponent(body.email || email)}&reason=unverified`);
          return;
        }
        setError('Those credentials were not accepted.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Could not connect. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Log in to NexDo</h2>
      <p className="au-panel-lede">See your tasks, calendar, and Daily Brief.</p>
      <form onSubmit={onSubmit} className="au-form">
        {passwordWasReset && <AuthAlert kind="ok">Your password has been reset. Log in with your new password.</AuthAlert>}
        <AuthField label="Email address" icon={Mail} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="username" required />
        <AuthPassword label="Password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required />
        <div className="au-row">
          <label className="au-check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Remember me</label>
          <Link className="au-link" href="/reset-password">Forgot password?</Link>
        </div>
        {error && <AuthAlert kind="error">{error}</AuthAlert>}
        <AuthButton type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</AuthButton>
      </form>
      <div className="au-foot">
        <p className="au-note">New to NexDo? <Link className="au-link" href="/signup">Create an account</Link></p>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      scene="login"
      aside={<>
        <h1>Welcome back <span>Your day is waiting.</span></h1>
        <p className="au-lede">Pick up where you left off: today’s plan, your calendar, and what needs you next.</p>
        <div className="au-focus">
          <Image src="/auth/target.webp" alt="" width={240} height={224} />
          <p><b>Stay focused today.</b><span>Plan, prioritize, and move forward with confidence.</span></p>
        </div>
      </>}
    >
      {/* useSearchParams needs a Suspense boundary. */}
      <Suspense fallback={<h2>Log in to NexDo</h2>}><LoginForm /></Suspense>
    </AuthShell>
  );
}
