'use client';

import { useEffect, useState } from 'react';
import { AppShell } from './app-shell';

export function Authed({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/me').then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setName(data.user?.name ?? 'You');
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
  if (!name) return <p className="p-8 text-[var(--muted)]">Opening Harbor…</p>;
  return <AppShell userName={name}>{children}</AppShell>;
}
