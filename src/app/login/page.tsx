'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('alex@harbor.app');
  const [password, setPassword] = useState('harbor-demo');
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
      setError('Those credentials were not accepted.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--faint)]">Harbor</p>
      <h1 className="mt-2 text-3xl font-semibold">Ask what is coming up.</h1>
      <p className="mt-2 text-[var(--muted)]">The demo account is already filled in. Sign in to hear today, the next three days, and your reminders.</p>
      <form onSubmit={onSubmit} className="harbor-card mt-6 space-y-3 p-5">
        <label className="block text-sm font-medium">
          Email
          <input className="harbor-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input className="harbor-input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="harbor-btn harbor-btn-brand w-full" type="submit">Sign in</button>
      </form>
    </main>
  );
}
