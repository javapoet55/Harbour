'use client';

import Link from 'next/link';
import { NexdoLogo } from '@/components/nexdo-logo';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Bot, CircleDollarSign, Gauge, HeartPulse, LogOut, Mic2, Users } from 'lucide-react';

const links = [
  { href: '/admin', label: 'Overview', icon: Gauge },
  { href: '/admin/ask', label: 'Ask Nexdo', icon: Bot },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/usage', label: 'Usage Analytics', icon: BarChart3 },
  { href: '/admin/engagement', label: 'Firebase Engagement', icon: BarChart3 },
  { href: '/admin/voice', label: 'Voice Analytics', icon: Mic2 },
  { href: '/admin/revenue', label: 'Revenue', icon: CircleDollarSign },
  { href: '/admin/health', label: 'System Health', icon: HeartPulse },
];

export function AdminShell({ children, name, email }: { children: React.ReactNode; name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signOutError, setSignOutError] = useState('');
  async function signOut() {
    setSignOutError('');
    try {
      const response = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
      if (!response.ok) throw new Error('Sign-out failed');
      router.replace('/admin/login');
      router.refresh();
    } catch { setSignOutError('Sign-out failed. Please try again.'); }
  }
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand"><NexdoLogo priority /></Link>
        <p className="admin-role">Super Admin</p>
        <nav className="admin-nav" aria-label="Admin navigation">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? 'active' : ''}><Icon size={19} /><span>{label}</span></Link>;
          })}
        </nav>
        <div className="admin-account">
          <div className="admin-avatar">{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
          <div><strong>{name}</strong><small>{email}</small></div>
        </div>
        {signOutError && <p role="alert">{signOutError}</p>}
        <button className="admin-signout" onClick={signOut}><LogOut size={18} /> Sign out</button>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
