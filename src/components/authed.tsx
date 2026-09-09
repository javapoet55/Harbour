'use client';

import { useEffect, useState } from 'react';
import { AppShell } from './app-shell';
import { NexdoLogo } from './nexdo-logo';

export function Authed({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  useEffect(() => {
    fetch('/api/me').then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setName(data.user?.name ?? 'You');
      setUserId(data.user?.id ?? '');
    });
    const tick = () => {
      void fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tick' }),
      });
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!name) return <div className="nexdo-app-loading" role="status"><NexdoLogo priority /><p>Opening Nexdo…</p></div>;
  return <AppShell userName={name} userId={userId}>{children}</AppShell>;
}
