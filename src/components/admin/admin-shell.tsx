'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, CircleDollarSign, Gauge, LogOut, Mic2, Sparkles, Users } from 'lucide-react';

const links = [
  { href: '/admin', label: 'Overview', icon: Gauge },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/usage', label: 'Usage Analytics', icon: BarChart3 },
  { href: '/admin/voice', label: 'Voice Analytics', icon: Mic2 },
  { href: '/admin/revenue', label: 'Revenue', icon: CircleDollarSign },
];

export function AdminShell({ children, name, email }: { children: React.ReactNode; name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand"><span className="admin-brand-mark"><Sparkles size={24} /></span><span>Nexdo</span></Link>
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
        <button className="admin-signout" onClick={signOut}><LogOut size={18} /> Sign out</button>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
