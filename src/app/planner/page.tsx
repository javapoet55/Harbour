'use client';

import { useEffect, useState } from 'react';
import { Authed } from '@/components/authed';
import type { PlanPayload, ReplanPayload } from '@/lib/types';

export default function PlannerPage() {
  const [plan, setPlan] = useState<PlanPayload | null>(null);
  const [replan, setReplan] = useState<ReplanPayload | null>(null);
  const [message, setMessage] = useState('');

  async function loadReplan() {
    const response = await fetch('/api/planner/replan');
    setReplan(await response.json());
  }
  useEffect(() => {
    let cancelled = false;
    fetch('/api/planner')
      .then((r) => r.json())
      .then((payload: PlanPayload) => {
        if (!cancelled) setPlan(payload);
      });
    fetch('/api/planner/replan').then((r) => r.json()).then((payload: ReplanPayload) => {
      if (!cancelled) setReplan(payload);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyReplan() {
    if (!replan?.actionId) return;
    const response = await fetch('/api/planner/replan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: replan.actionId }) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || 'The replan could not be applied.'); await loadReplan(); return; }
    setMessage(`Moved ${result.moved} task${result.moved === 1 ? '' : 's'}.${result.externalSyncFailures ? ` ${result.externalSyncFailures} external calendar update${result.externalSyncFailures === 1 ? '' : 's'} need retrying.` : ''}`);
    await loadReplan();
  }

  return (
    <Authed>
      <h1 className="text-3xl font-semibold">AI Daily Planner</h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">Harbor compares tomorrow’s open hours with task duration. It recommends a plan and will not move anything until you approve it.</p>
      {!replan ? <p className="mt-6">Checking for schedule changes…</p> : (
        <section className="harbor-card mt-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Continuous replanning</h2><p className="mt-1 text-sm text-[var(--muted)]">{replan.spoken}</p></div>
            <button type="button" className="harbor-btn" onClick={() => void loadReplan()}>Recheck</button>
          </div>
          {replan.moves.length > 0 && <div className="mt-4 space-y-3">{replan.moves.map((move) => (
            <article key={move.taskId} className="rounded-xl border border-[var(--line)] p-3">
              <p className="font-medium">{move.title}</p>
              <p className="mt-1 text-sm">{move.fromLabel} → <span className="font-medium">{move.toLabel}</span></p>
              <p className="mt-1 text-xs text-[var(--muted)]">Reason: {move.reasonLabel}</p>
            </article>
          ))}</div>}
          {replan.risks.length > 0 && <div className="mt-4 rounded-xl bg-[#faeeda] p-3"><p className="text-sm font-semibold">Capacity warnings</p><ul className="mt-1 text-sm">{replan.risks.map((risk) => <li key={risk.taskId}>{risk.title}: {risk.reason === 'no_capacity' ? 'no open working-hours block' : 'may finish after its deadline'}</li>)}</ul></div>}
          {replan.actionId && <button type="button" className="harbor-btn harbor-btn-brand mt-4" onClick={() => void applyReplan()}>Approve {replan.moves.length} changes</button>}
          {message && <p className="mt-3 text-sm text-[var(--ok)]">{message}</p>}
        </section>
      )}
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
