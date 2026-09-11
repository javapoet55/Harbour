'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NexdoLogo } from '@/components/nexdo-logo';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === 'string' ? body.error : 'We could not create your account. Please try again.');
        return;
      }
      const body = await response.json().catch(() => ({}));
      router.push(`/verify-email?email=${encodeURIComponent(email)}${body.developmentCode ? `&code=${body.developmentCode}` : ''}`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-5 py-10">
      <div className="grid w-full gap-10 md:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] md:items-center md:gap-16">
        <section>
          <Link href="/welcome" className="nexdo-login-brand" aria-label="Nexdo home"><NexdoLogo priority /></Link>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">AI-powered to-do, made simple</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Make space for what matters.</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-[var(--muted)]">Nexdo turns conversations into clear next steps, plans your day around real commitments, and helps you keep moving without the mental load.</p>
          <div className="mt-7 grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
            <p className="rounded-2xl border border-[var(--line)] bg-white/70 p-4"><strong className="block text-[var(--ink)]">Capture naturally</strong><span className="mt-1 block">Tell Nexdo what you need in your own words.</span></p>
            <p className="rounded-2xl border border-[var(--line)] bg-white/70 p-4"><strong className="block text-[var(--ink)]">Plan with confidence</strong><span className="mt-1 block">See the right next action when you need it.</span></p>
            <p className="rounded-2xl border border-[var(--line)] bg-white/70 p-4"><strong className="block text-[var(--ink)]">Stay in control</strong><span className="mt-1 block">Review suggested changes before they happen.</span></p>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold">Create your account</h2>
          <p className="mt-2 text-[var(--muted)]">Start making your day easier with Nexdo.</p>
          <form onSubmit={onSubmit} className="harbor-card mt-6 space-y-3 p-5">
            <label className="block text-sm font-medium">Full name<input className="harbor-input mt-1" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
            <label className="block text-sm font-medium">Email address<input className="harbor-input mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label className="block text-sm font-medium">Password<input className="harbor-input mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
            <label className="block text-sm font-medium">Confirm password<input className="harbor-input mt-1" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
            <p className="text-sm leading-6 text-[var(--muted)]">Use at least 12 characters. Your password is securely protected with a one-way hash.</p>
            {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
            <button className="harbor-btn harbor-btn-brand w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</button>
          </form>
          <p className="mt-4 text-center text-sm text-[var(--muted)]">Already have an account? <Link className="font-semibold text-[var(--brand)] hover:underline" href="/login">Sign in</Link></p>
        </section>
      </div>
    </main>
  );
}
