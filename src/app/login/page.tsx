'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NexdoLogo } from '@/components/nexdo-logo';
import { PasswordInput } from '@/components/password-input';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(process.env.NODE_ENV === 'production' ? '' : 'alex@harbor.app');
  const [password, setPassword] = useState(process.env.NODE_ENV === 'production' ? '' : 'harbor-demo');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/verify-email?email=${encodeURIComponent(body.email || email)}&reason=unverified`);
        return;
      }
      setError('Those credentials were not accepted.');
      return;
    }
    const body = await res.json().catch(() => ({}));
    router.push(body.admin ? '/admin' : '/');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <Link href="/welcome" className="nexdo-login-brand" aria-label="Nexdo home"><NexdoLogo priority /></Link>
      <h1 className="mt-2 text-3xl font-semibold">Ask what is coming up.</h1>
      <p className="mt-2 text-[var(--muted)]">Sign in to see your tasks, calendar, and personal briefing.</p>
      <form onSubmit={onSubmit} className="harbor-card mt-6 space-y-3 p-5">
        <label className="block text-sm font-medium">
          Email
          <input className="harbor-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <div className="text-right"><Link className="text-sm font-medium text-[var(--brand)] hover:underline" href="/reset-password">Forgot password?</Link></div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="harbor-btn harbor-btn-brand w-full" type="submit">Sign in</button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--muted)]">New to Nexdo? <Link className="font-semibold text-[var(--brand)] hover:underline" href="/signup">Create an account</Link></p>
    </main>
  );
}
