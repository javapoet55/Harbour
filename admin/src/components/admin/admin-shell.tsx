'use client';

import Link from 'next/link';
import { NexdoLogo } from '@/components/nexdo-logo';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Bug, Bot, ChevronDown, ClipboardList, CircleDollarSign, Gauge, HeartPulse, LogOut, Mic2, QrCode, Users } from 'lucide-react';

const primaryLinks = [
  { href: '/ask', label: 'Ask Nexdo', icon: Bot },
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/users', label: 'Users', icon: Users },
];

const reportLinks = [
  { href: '/revenue', label: 'Revenue', icon: CircleDollarSign },
  { href: '/usage', label: 'Usage Analytics', icon: BarChart3 },
  { href: '/qr-analytics', label: 'QR Code Analytics', icon: QrCode },
  { href: '/engagement', label: 'Firebase Engagement', icon: BarChart3 },
  { href: '/voice', label: 'Voice Analytics', icon: Mic2 },
  { href: '/bug-reports', label: 'Bug Reports', icon: Bug },
];

const otherLinks = [
  { href: '/health', label: 'System Health', icon: HeartPulse },
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
      router.replace('/login');
      router.refresh();
    } catch { setSignOutError('Sign-out failed. Please try again.'); }
  }
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
  const inReports = reportLinks.some(({ href }) => isActive(href));
  function navLink({ href, label, icon: Icon }: (typeof primaryLinks)[number]) {
    const active = isActive(href);
    return <Link key={href} href={href} aria-label={label} title={label} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''}>
      <Icon size={19} aria-hidden="true"/><span>{label}</span>
    </Link>;
  }
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand"><NexdoLogo priority /></Link>
        <p className="admin-role">Super Admin</p>
        <nav className="admin-nav" aria-label="Admin navigation">
          {primaryLinks.map(navLink)}
          <details className={`admin-reports-nav${inReports ? ' current' : ''}`} open={inReports}>
            <summary aria-label="Reports" title="Reports">
              <ClipboardList size={19} aria-hidden="true"/><span>Reports</span><ChevronDown size={15} className="admin-reports-chevron" aria-hidden="true"/>
            </summary>
            <div className="admin-reports-links">{reportLinks.map(navLink)}</div>
          </details>
          {otherLinks.map(navLink)}
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
