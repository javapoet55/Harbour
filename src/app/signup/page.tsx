'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarCheck, CalendarDays, Home, Mail, Mic, Plus, Sparkles, Star, User } from 'lucide-react';
import { SignupBotCheck } from '@/components/signup-bot-check';
import { AuthAlert, AuthButton, AuthField, AuthPassword, AuthShell } from '@/components/auth/auth-ui';

const points = [
  { icon: CalendarDays, title: 'Plan your day with a smarter Daily Brief' },
  { icon: Mic, title: 'Capture tasks by voice or text' },
  { icon: CalendarCheck, title: 'Keep tasks and calendar in sync' },
  { icon: Sparkles, title: 'Let NexDo AI prepare', detail: 'your next step — you confirm' },
];

/** A picture of the app for the sign-up page. Decoration only; hidden from screen readers and small screens. */
function PhonePreview() {
  return (
    <div className="au-phone" aria-hidden="true">
      <div className="au-phone-screen">
        <p className="au-phone-time">9:41</p>
        <p className="au-phone-brand">NexDo<i>✦</i></p>
        <p className="au-phone-title">Daily Brief ☀️</p>
        <p className="au-phone-sub">Here’s your plan for today.</p>
        <ul className="au-phone-list">
          <li>Team Standup<time>9:00 AM</time></li>
          <li>Review Q3 deck<time>11:00 AM</time></li>
          <li>Pick up groceries<time>5:00 PM</time></li>
        </ul>
        <p className="au-phone-next"><b>✦ Next Step</b>Prepare for your 11 AM deck review. I can pull up the notes.</p>
        <div className="au-phone-tabs"><Home size={16} /><CalendarDays size={16} /><span><Plus size={18} /></span><Star size={16} /><User size={16} /></div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [turnstileToken, setTurnstileToken] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, turnstileToken }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === 'string' ? body.error : 'We could not create your account. Please try again.');
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (typeof body.verificationProof === 'string') sessionStorage.setItem('nexdo-verification-proof', body.verificationProof);
      router.push(`/verify-email?email=${encodeURIComponent(email)}${body.emailSent === false ? '&sent=0' : ''}${body.developmentCode ? `&code=${body.developmentCode}` : ''}`);
    } catch {
      setError('Could not connect. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
      setAttempt((value) => value + 1);
    }
  }

  return (
    <AuthShell
      scene="signup"
      aside={<>
        <h1>Less on your mind. <span>More done in your day.</span></h1>
        <p className="au-lede">One place for tasks, calendars, reminders, and life’s important moments.</p>
        <ul className="au-points">
          {points.map(({ icon: Icon, title, detail }) => (
            <li key={title}><span className="au-tile"><Icon size={24} aria-hidden="true" /></span><span>{title}{detail && <small>{detail}</small>}</span></li>
          ))}
        </ul>
        <PhonePreview />
      </>}
    >
      <h2>Create your NexDo account</h2>
      <form onSubmit={onSubmit} className="au-form">
        <AuthField label="Full name" icon={User} value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your full name" autoComplete="name" required />
        <AuthField label="Email address" icon={Mail} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
        <AuthPassword label="Password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a password" autoComplete="new-password" minLength={1} required />
        <div className="au-bot"><SignupBotCheck onToken={setTurnstileToken} attempt={attempt} /></div>
        {error && <AuthAlert kind="error">{error}</AuthAlert>}
        <AuthButton type="submit" disabled={isSubmitting || !turnstileToken}>{isSubmitting ? 'Creating account…' : 'Create free account'}</AuthButton>
      </form>
      <div className="au-foot">
        <p className="au-note">Already have an account? <Link className="au-link" href="/login">Log in</Link></p>
        <p className="au-legal">By creating an account, you agree to our <a href="https://www.nexdoapp.com/terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="https://www.nexdoapp.com/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>
      </div>
    </AuthShell>
  );
}
