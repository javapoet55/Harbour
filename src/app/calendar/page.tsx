'use client';

import { useEffect, useState } from 'react';
import { Authed } from '@/components/authed';
import type { AgendaPayload, AgendaTask } from '@/lib/types';

type View = 'day' | 'week' | 'month' | 'agenda' | 'three' | 'five';

function daysForView(view: View) {
  if (view === 'day') return 1;
  if (view === 'three') return 3;
  if (view === 'week' || view === 'five') return 5;
  return 31;
}

export default function CalendarPage() {
  const [view, setView] = useState<View>('agenda');
  const [data, setData] = useState<AgendaPayload | null>(null);
  const days = daysForView(view);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agenda?days=${days}`)
      .then((r) => r.json())
      .then((payload: AgendaPayload) => {
        if (!cancelled) setData(payload);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  async function drop(taskId: string, day: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: day, time: '09:00', durationMin: 45 }),
    });
    const res = await fetch(`/api/agenda?days=${days}`);
    setData(await res.json());
  }

  return (
    <Authed>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Calendar</h1>
        <div className="flex flex-wrap gap-2">
          {(['day', 'week', 'month', 'agenda', 'three', 'five'] as View[]).map((v) => (
            <button key={v} type="button" className={`harbor-btn ${view === v ? 'harbor-btn-brand' : ''}`} onClick={() => setView(v)}>
              {v === 'three' ? 'Next 3 days' : v === 'five' ? 'Next 5 days' : v}
            </button>
          ))}
        </div>
      </div>
      {!data ? <p>Loading calendar…</p> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <section className="harbor-card p-4">
            {(data.range?.days ?? []).slice(0, view === 'month' ? 31 : days).map((day: string) => {
              const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: data.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
              const events = data.events.filter((e) => dayOf(e.startAt) === day);
              const tasks = data.tasks.filter((t) => dayOf(t.startAt || t.dueAt || '') === day);
              return (
                <div
                  key={day}
                  className="border-b border-[var(--line)] py-3 last:border-0"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData('text/task-id');
                    if (id) void drop(id, day);
                  }}
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--faint)]">{day}</p>
                  {events.map((event) => (
                    <p key={event.id} className="mt-1 rounded-lg bg-[var(--brand-soft)] px-2 py-1 text-sm">{event.title}</p>
                  ))}
                  {tasks.map((task) => (
                    <p key={task.id} className="mt-1 rounded-lg bg-[#faeeda] px-2 py-1 text-sm">{task.title}</p>
                  ))}
                </div>
              );
            })}
          </section>
          <aside className="harbor-card p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--faint)]">Unscheduled / overdue</h2>
            {[...data.overdue, ...data.unscheduled].map((task: AgendaTask) => (
              <button
                key={task.id}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}
                className="mt-2 block w-full rounded-lg border border-[var(--line)] px-3 py-2 text-left text-sm"
              >
                {task.title}
              </button>
            ))}
            <p className="mt-3 text-xs text-[var(--muted)]">Drag a task onto a day to schedule it. Harbor updates reminders and the connected calendar without duplicating the event.</p>
          </aside>
        </div>
      )}
    </Authed>
  );
}
