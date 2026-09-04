'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3, Bell, CalendarDays, CircleCheck, Inbox, Mic, MoreHorizontal, Sparkles, Sun, Timer,
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
  { href: '/voice', label: 'Voice', icon: Mic },
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
        <main className="flex-1 px-4 py-5 pb-28 md:px-8">{children}</main>
        <VoiceDock />
        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--line)] bg-[var(--bg-elev)] px-2 py-2 md:hidden" aria-label="Mobile">
          {MOBILE.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={cn('flex flex-col items-center gap-1 px-2 text-[11px]', active ? 'text-[var(--brand)]' : 'text-[var(--muted)]')}>
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
