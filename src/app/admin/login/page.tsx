'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, Mail, ShieldCheck, Sparkles } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(action: 'request' | 'verify') {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'request' ? { action, email } : { action, code }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to sign in. Please try again.');
      if (action === 'verify') {
        router.replace('/admin');
        router.refresh();
        return;
      }
      setSent(true); setCode('');
      setNotice('If this email belongs to an authorized administrator, a code has been sent. Check your inbox and spam folder.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to connect. Please try again.');
    } finally { setBusy(false); }
  }

  return <main className="admin-login">
    <section className="admin-login-story" aria-label="NEXDO Admin">
      <Link href="/admin/login" className="admin-login-brand"><Sparkles aria-hidden="true" size={30} /> NEXDO <span>ADMIN</span></Link>
      <div className="admin-login-intro"><span className="admin-login-eyebrow">YOUR PLATFORM. ONE PLACE.</span><h1>A clear view.<br />A secure start.</h1><p>Manage your platform, understand your users, and keep Nexdo moving forward.</p></div>
      <p className="admin-login-security"><ShieldCheck size={20} aria-hidden="true" /> Protected with email verification at every sign-in.</p>
    </section>
    <section className="admin-login-panel">
      <div className="admin-login-form">
        <span className="admin-login-icon"><Mail size={26} aria-hidden="true" /></span>
        <p className="admin-login-eyebrow">ADMIN PORTAL</p>
        <h2>{sent ? 'Check your inbox' : 'Welcome back'}</h2>
        <p className="admin-login-description">{sent ? `Enter the six-digit code sent to ${email}.` : 'Enter your admin email to receive a one-time sign-in code.'}</p>
        <form onSubmit={(event) => { event.preventDefault(); void submit(sent ? 'verify' : 'request'); }}>
          {sent ? <label htmlFor="admin-code">Verification code<input autoFocus id="admin-code" name="code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="000000" className="admin-code-input" disabled={busy} /></label>
            : <label htmlFor="admin-email">Admin email<input id="admin-email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required maxLength={254} placeholder="you@company.com" disabled={busy} /></label>}
          {error && <p className="admin-login-error" role="alert">{error}</p>}
          {notice && <p className="admin-login-notice" role="status">{notice}</p>}
          <button className="admin-login-submit" type="submit" disabled={busy || (sent && code.length !== 6)}>{busy ? <><LoaderCircle className="animate-spin" size={18} /> Please wait…</> : <>{sent ? 'Verify & sign in' : 'Send sign-in code'}<ArrowRight size={18} /></>}</button>
        </form>
        {sent && <div className="admin-login-actions"><button type="button" disabled={busy} onClick={() => void submit('request')}>Resend code</button><button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(''); setNotice(''); }}>Use another email</button></div>}
        <p className="admin-login-footnote"><ShieldCheck size={16} aria-hidden="true" /> {sent ? 'Codes expire in 10 minutes and can be used once.' : 'No password. A fresh code for every sign-in.'}</p>
        <Link href="/login" className="admin-login-back">Go to Nexdo account login</Link>
      </div>
    </section>
  </main>;
}
