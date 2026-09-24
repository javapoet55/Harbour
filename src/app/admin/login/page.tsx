'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NexdoLogo } from '@/components/nexdo-logo';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to sign in.');
      setPassword(''); router.replace('/admin'); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to connect. Please try again.');
    } finally { setBusy(false); }
  }

  return <main className="admin-login">
    <section className="admin-login-story" aria-label="NEXDO Admin">
      <Link href="/admin/login" className="admin-login-brand"><NexdoLogo priority /><span>ADMIN</span></Link>
      <div className="admin-login-intro"><span className="admin-login-eyebrow">YOUR PLATFORM. ONE PLACE.</span><h1>A clear view.<br />A secure start.</h1><p>Manage your platform, understand your users, and keep Nexdo moving forward.</p></div>
      <p className="admin-login-security"><ShieldCheck size={20} aria-hidden="true" /> Restricted to authorized administrators.</p>
    </section>
    <section className="admin-login-panel">
      <div className="admin-login-form">
        <span className="admin-login-icon"><Mail size={26} aria-hidden="true" /></span>
        <p className="admin-login-eyebrow">ADMIN PORTAL</p>
        <h2>Welcome back</h2>
        <p className="admin-login-description">Sign in with your existing Nexdo admin email and password.</p>
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label htmlFor="admin-email">Admin email<input id="admin-email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required maxLength={254} placeholder="you@company.com" disabled={busy} /></label>
          <label htmlFor="admin-password">Password<input id="admin-password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required maxLength={72} disabled={busy} /></label>
          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <button className="admin-login-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" size={18} /> Signing in…</> : <>Sign in<ArrowRight size={18} /></>}</button>
        </form>
        <p className="admin-login-footnote"><ShieldCheck size={16} aria-hidden="true" /> Email OTP is temporarily disabled.</p>
        <Link href="/login" className="admin-login-back">Go to Nexdo account login</Link>
      </div>
    </section>
  </main>;
}
