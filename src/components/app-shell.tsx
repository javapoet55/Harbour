'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3, Bell, CalendarDays, CircleCheck, Inbox, MoreHorizontal, Sparkles, Sun, Timer, Plus,
} from 'lucide-react';
import { VoiceDock } from './voice-dock';
import { cn } from '@/lib/utils';

const DESKTOP = [
  { href: '/', label: 'My Day', icon: Sun },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/tasks', label: 'Tasks', icon: CircleCheck },
  { href: '/waiting', label: 'Waiting For', icon: Timer },
  { href: '/planner', label: 'AI Planner', icon: Sparkles },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: MoreHorizontal },
];

const MOBILE = [
  { href: '/', label: 'Today', icon: Sun },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/tasks', label: 'Tasks', icon: CircleCheck },
  { href: '/settings', label: 'More', icon: MoreHorizontal },
];

export function AppShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="harbor-shell">
      <aside className="harbor-side border-r border-[var(--line)] bg-[var(--bg-elev)] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--faint)]">Harbor</p>
        <p className="mt-2 text-lg font-semibold">{userName}</p>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Desktop">
          {DESKTOP.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted)]',
                  active && 'bg-[var(--brand-soft)] text-[var(--brand)]',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button type="button" onClick={logout} className="harbor-btn mt-8 w-full">Sign out</button>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="mobile-brand-header sticky top-0 z-20 flex items-center justify-between px-5 py-3 md:hidden">
          <p className="text-base font-bold uppercase tracking-[0.18em] text-[#203b61]">Harbor</p>
          <div className="flex gap-3">{pathname === '/' ? <button className="mobile-add-button" aria-label="Add a task" onClick={() => window.dispatchEvent(new Event('harbor:quick-add'))}><Plus size={24} /></button> : <Link className="mobile-add-button" href="/" aria-label="Go to Today"><Sun size={23} /></Link>}<Link href="/settings" className="mobile-avatar" aria-label={`${userName} profile and settings`}>{userName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Link></div>
        </header>
        <main className="harbor-main min-w-0 flex-1 px-3 py-4 sm:px-4 md:px-8 md:py-5">{children}</main>
        <VoiceDock />
        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--line)] bg-[color:var(--bg-elev)]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_18px_rgba(31,36,48,0.08)] backdrop-blur md:hidden" aria-label="Mobile">
          {MOBILE.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={cn('flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-medium', active ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--muted)]')}>
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
