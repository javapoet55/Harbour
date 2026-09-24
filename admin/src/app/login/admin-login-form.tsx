'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NexdoLogo } from '@/components/nexdo-logo';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';

export const RESEND_DELAY_SECONDS = 30;

async function post(body: object) {
  const response = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Unable to sign in. Please try again.');
  return result;
}
const message = (reason: unknown) => (reason instanceof Error ? reason.message : 'Unable to connect. Please try again.');

// Step 1 asks for the email; step 2 for the emailed code. Every address sees the same screens and wording,
// so the page never reveals whether an email belongs to an administrator.
export function AdminLoginForm({ appLoginUrl }: { appLoginUrl: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const codeInput = useRef<HTMLInputElement>(null);
  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => { setNow(Date.now()); if (Date.now() >= resendAt) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  useEffect(() => { if (step === 'code') codeInput.current?.focus(); }, [step]);

  async function sendCode(resend: boolean) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await post({ action: 'request', email });
      setCode(''); setStep('code');
      setResendAt(Date.now() + RESEND_DELAY_SECONDS * 1000); setNow(Date.now());
      if (resend) setNotice('A new code is on its way. Earlier codes no longer work.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }

  async function verify() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await post({ action: 'verify', email, code });
      setCode(''); router.replace('/'); router.refresh();
    } catch (reason) { setError(message(reason)); setBusy(false); }
  }

  function changeEmail() {
    setStep('email'); setCode(''); setError(''); setNotice(''); setResendAt(0);
  }

  return <main className="admin-login">
    <section className="admin-login-story" aria-label="NEXDO Admin">
      <Link href="/login" className="admin-login-brand"><NexdoLogo priority /><span>ADMIN</span></Link>
      <div className="admin-login-intro"><span className="admin-login-eyebrow">YOUR PLATFORM. ONE PLACE.</span><h1>A clear view.<br />A secure start.</h1><p>Manage your platform, understand your users, and keep Nexdo moving forward.</p></div>
      <p className="admin-login-security"><ShieldCheck size={20} aria-hidden="true" /> Restricted to authorized administrators.</p>
    </section>
    <section className="admin-login-panel">
      <div className="admin-login-form">
        <span className="admin-login-icon"><Mail size={26} aria-hidden="true" /></span>
        <p className="admin-login-eyebrow">ADMIN PORTAL</p>
        {step === 'email' ? <>
          <h2>Welcome back</h2>
          <p className="admin-login-description">Enter your Nexdo admin email and we&apos;ll send you a 6-digit sign-in code.</p>
          <form onSubmit={(event) => { event.preventDefault(); void sendCode(false); }}>
            <label htmlFor="admin-email">Admin email<input id="admin-email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required maxLength={254} placeholder="you@company.com" disabled={busy} /></label>
            {error && <p className="admin-login-error" role="alert">{error}</p>}
            <button className="admin-login-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" size={18} /> Sending code…</> : <>Send code<ArrowRight size={18} /></>}</button>
          </form>
        </> : <>
          <h2>Check your email</h2>
          <p className="admin-login-description">Enter the 6-digit code we sent to <strong>{email}</strong>.</p>
          <form onSubmit={(event) => { event.preventDefault(); void verify(); }}>
            <label htmlFor="admin-code">Sign-in code<input ref={codeInput} id="admin-code" name="code" className="admin-code-input" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required minLength={6} maxLength={6} placeholder="••••••" disabled={busy} /></label>
            {notice && <p className="admin-login-notice" role="status">{notice}</p>}
            {error && <p className="admin-login-error" role="alert">{error}</p>}
            <button className="admin-login-submit" type="submit" disabled={busy || code.length !== 6}>{busy ? <><LoaderCircle className="animate-spin" size={18} /> Signing in…</> : <>Sign in<ArrowRight size={18} /></>}</button>
          </form>
          <div className="admin-login-actions">
            <button type="button" onClick={() => void sendCode(true)} disabled={busy || waitSeconds > 0}>{waitSeconds > 0 ? `Resend code in ${waitSeconds}s` : 'Resend code'}</button>
            <button type="button" onClick={changeEmail} disabled={busy}>Use a different email</button>
          </div>
        </>}
        <p className="admin-login-footnote"><ShieldCheck size={16} aria-hidden="true" /> Codes expire after 10 minutes and work once.</p>
        {appLoginUrl && <a href={appLoginUrl} className="admin-login-back">Go to Nexdo account login</a>}
      </div>
    </section>
  </main>;
}
