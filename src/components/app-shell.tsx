'use client';

import Link from 'next/link';
import Image from 'next/image';
import { NexdoLogo } from './nexdo-logo';
import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3, Bell, CalendarDays, CircleCheck, CreditCard, Download, Inbox, MoreHorizontal, Sparkles, Sun, Timer, Plus, X,
} from 'lucide-react';
import { VoiceDock } from './voice-dock';
import { cn } from '@/lib/utils';
import { FocusSessionProvider, FocusSessionBanner } from './focus-session';
import { OfflineBanner } from './offline-banner';
import { InstallPrompt } from './install-prompt';

const DESKTOP = [
  { href: '/', label: 'My Day', icon: Sun },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/tasks', label: 'Tasks', icon: CircleCheck },
  { href: '/waiting', label: 'Waiting For', icon: Timer },
  { href: '/planner', label: 'AI Planner', icon: Sparkles },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/billing', label: 'Plans and billing', icon: CreditCard },
  { href: '/import-export', label: 'Import and export', icon: Download },
  { href: '/settings', label: 'Settings', icon: MoreHorizontal },
];

const MOBILE = [
  { href: '/', label: 'Today', icon: Sun },
  { href: '/tasks', label: 'Tasks', icon: CircleCheck },
  { href: '/voice', label: 'Ask AI', icon: Sparkles },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
];

export function AppShell({
  userName,
  userId,
  children,
}: {
  userName: string;
  userId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const moreRef = useRef<HTMLDialogElement>(null);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <FocusSessionProvider userId={userId}><OfflineBanner /><InstallPrompt /><div className="harbor-shell">
      <aside className="harbor-side border-r border-[var(--line)] bg-[var(--bg-elev)] p-5">
        <Link href="/" aria-label="Nexdo home"><NexdoLogo priority /></Link>
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
          <Link href="/" aria-label="Nexdo home"><NexdoLogo compact priority /></Link>
          <div className="flex items-center gap-3">{['/', '/calendar', '/tasks'].includes(pathname) && <button type="button" className="mobile-add-button" aria-label="Add a task" onClick={() => window.dispatchEvent(new Event(pathname === '/calendar' ? 'harbor:calendar-add' : pathname === '/tasks' ? 'harbor:tasks-add' : 'harbor:quick-add'))}><Plus size={24} aria-hidden="true" /></button>}{process.env.NODE_ENV !== 'production' && <span className="mobile-temperature" aria-label="72 degrees Fahrenheit, static preview" title="Static preview temperature">72°</span>}<button className="mobile-avatar overflow-hidden" aria-label={`Open More for ${userName}`} onClick={() => moreRef.current?.showModal()}><Image src="/donext-profile-v2.png" alt="Profile photo" width={42} height={42} className="h-full w-full object-cover" /></button></div>
        </header>
        <main className="harbor-main min-w-0 flex-1 px-3 py-4 sm:px-4 md:px-8 md:py-5">{children}</main>
        <VoiceDock />
        <FocusSessionBanner />
        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--line)] bg-[color:var(--bg-elev)]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_18px_rgba(31,36,48,0.08)] backdrop-blur md:hidden" aria-label="Mobile">
          {MOBILE.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={(event) => { if (item.href === '/voice') { event.preventDefault(); window.dispatchEvent(new Event('harbor:open-assistant')); } }} className={cn('flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-medium', active ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--muted)]')}>
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <dialog ref={moreRef} className="donext-more"><header><div><p>{userName}</p><h2>More</h2></div><button aria-label="Close More" onClick={() => moreRef.current?.close()}><X size={23} /></button></header><nav aria-label="More options">{DESKTOP.filter((item) => !['/', '/calendar'].includes(item.href)).map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => moreRef.current?.close()}><Icon size={20} />{item.label}</Link>; })}</nav><button className="harbor-btn w-full" onClick={() => { moreRef.current?.close(); void logout(); }}>Sign out</button></dialog>
      </div>
    </div></FocusSessionProvider>
  );
}
