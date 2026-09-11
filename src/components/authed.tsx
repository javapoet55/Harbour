'use client';

import { useEffect, useState } from 'react';
import { AppShell } from './app-shell';
import { NexdoLogo } from './nexdo-logo';
import { readCachedProfile } from '@/lib/profile-cache';

export function Authed({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string | null>(() => {
    const cached = readCachedProfile();
    return cached.name?.trim() || 'You';
  });
  const [userId, setUserId] = useState('');

  async function loadMe() {
    const response = await fetch('/api/me', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setName(data.user?.name ?? 'You');
    setUserId(data.user?.id ?? '');
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMe();
    const tick = () => {
      void fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tick' }),
      });
    };
    const onProfileUpdated = (event: Event) => {
      const latest = readCachedProfile();
      const detail = (event as CustomEvent<{ name?: string; timeZone?: string }>).detail;
      if (detail?.name) {
        setName(detail.name);
        return;
      }
      if (latest.name) {
        setName(latest.name);
        return;
      }
      void loadMe();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'harbor:profile-cache:v1') return;
      const next = event.newValue ? readCachedProfile() : {};
      if (next.name) setName(next.name);
    };

    tick();
    const id = window.setInterval(tick, 60_000);
    window.addEventListener('harbor:profile-updated', onProfileUpdated);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', loadMe);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('harbor:profile-updated', onProfileUpdated);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', loadMe);
    };
  }, []);
  if (!name) return <div className="nexdo-app-loading" role="status"><NexdoLogo priority /><p>Opening Nexdo…</p></div>;
  return <AppShell userName={name} userId={userId}>{children}</AppShell>;
}
