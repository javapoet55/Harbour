'use client';

import { useEffect, useState } from 'react';
import { Authed } from '@/components/authed';
import type { PlanPayload } from '@/lib/types';

export default function PlannerPage() {
  const [plan, setPlan] = useState<PlanPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/planner')
      .then((r) => r.json())
      .then((payload: PlanPayload) => {
        if (!cancelled) setPlan(payload);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Authed>
      <h1 className="text-3xl font-semibold">AI Daily Planner</h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">Harbor compares tomorrow’s open hours with task duration. It recommends a plan and will not move anything until you approve it.</p>
      {!plan ? <p className="mt-6">Building tomorrow’s plan…</p> : (
        <section className="harbor-card mt-6 p-5">
          <p className="text-lg">{plan.spoken}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h2 className="text-sm font-bold uppercase text-[var(--faint)]">Do these</h2>
              <ul className="mt-2 space-y-1 text-sm">{plan.visual.tasks.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase text-[var(--faint)]">Consider moving</h2>
              <ul className="mt-2 space-y-1 text-sm">{plan.visual.overdue.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">{plan.visual.next}</p>
        </section>
      )}
    </Authed>
  );
}
