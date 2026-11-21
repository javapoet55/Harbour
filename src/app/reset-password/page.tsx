'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import { AuthAlert, AuthButton, AuthField, AuthPassword, AuthShell } from '@/components/auth/auth-ui';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setError(''); setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || 'Could not request a reset code.'); return; }
      setSent(true);
      setMessage(body.developmentCode ? `Your development code is ${body.developmentCode}.` : '');
    } catch { setError('Could not connect. Please check your connection and try again.'); }
    finally { setBusy(false); }
  }

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    await sendCode();
  }

  async function reset(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || 'Could not reset your password.'); return; }
      router.push('/login?reset=complete');
    } catch { setError('Could not connect. Please check your connection and try again.'); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell
      scene="reset"
      aside={<>
        <h1>Reset your <span>password</span></h1>
        <p className="au-lede">Enter the email linked to NexDo and we’ll send you a 6-digit reset code.</p>
      </>}
    >
      {!sent ? <>
        <h2>Forgot your password?</h2>
        <p className="au-panel-lede">It happens. We’ll email you a code to set a new one.</p>
        <form onSubmit={requestCode} className="au-form">
          <AuthField label="Email address" icon={Mail} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
          {error && <AuthAlert kind="error">{error}</AuthAlert>}
          <AuthButton type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset code'}</AuthButton>
        </form>
      </> : <>
        <div className="au-inbox">
          <Image src="/auth/email-sent.webp" alt="" width={240} height={240} />
          <b>Check your inbox</b>
          <p>If <strong>{email}</strong> has a NexDo account, we’ve sent it a 6-digit code. Enter it below to create a new password. The code expires in 15 minutes.</p>
        </div>
        <form onSubmit={reset} className="au-form">
          <AuthField label="Reset code" icon={KeyRound} code inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" />
          <AuthPassword label="New password" minLength={1} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a new password" autoComplete="new-password" />
          {message && <AuthAlert kind="ok">{message}</AuthAlert>}
          {error && <AuthAlert kind="error">{error}</AuthAlert>}
          <AuthButton type="submit" disabled={busy}>{busy ? 'Working…' : 'Set new password'}</AuthButton>
        </form>
        <div className="au-foot">
          <p className="au-note">Didn’t get it? <button type="button" className="au-link" disabled={busy} onClick={() => void sendCode()}>Send a new code</button></p>
          <p className="au-note"><button type="button" className="au-link" onClick={() => { setSent(false); setCode(''); setPassword(''); setMessage(''); setError(''); }}>Use a different email</button></p>
        </div>
      </>}
      <div className="au-foot">
        <p className="au-note"><Link className="au-link au-back" href="/login"><ArrowLeft size={17} aria-hidden="true" />Back to login</Link></p>
      </div>
    </AuthShell>
  );
}
