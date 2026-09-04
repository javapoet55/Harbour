'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDay } from '@/lib/time';
import type { AgendaPayload } from '@/lib/types';

export function TodayBoard() {
  const [data, setData] = useState<AgendaPayload | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');

  async function load() {
    const res = await fetch('/api/agenda?days=5');
    if (!res.ok) {
      setError('Could not load your day.');
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agenda?days=5')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((payload: AgendaPayload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your day.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const todayKey = data?.range.days[0];
  const timeZone = data?.timeZone;
  const dayOf = (iso: string | null) =>
    iso && timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '';
  const todayTasks = useMemo(() => {
    const inDay = (iso: string | null) =>
      iso && timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '';
    return data?.tasks.filter((t) => inDay(t.dueAt) === todayKey || inDay(t.startAt) === todayKey) ?? [];
  }, [data, todayKey, timeZone]);
  const todayEvents = useMemo(() => {
    const inDay = (iso: string | null) =>
      iso && timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '';
    return data?.events.filter((e) => inDay(e.startAt) === todayKey) ?? [];
  }, [data, todayKey, timeZone]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    setTitle('');
    await load();
  }

  async function complete(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) });
    await load();
  }

  if (error) return <p className="text-[var(--danger)]">{error}</p>;
  if (!data) return <p className="text-[var(--muted)]">Loading your day…</p>;

  const greetingHour = new Date().getHours();
  const hello = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-[var(--muted)]">{formatDay(new Date(), data.timeZone)}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{hello}.</h1>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">Ask what is coming up, capture a task by voice, and Harbor will keep the reminders honest.</p>
      </header>

      <form onSubmit={addTask} className="flex flex-col gap-2 sm:flex-row">
        <input className="harbor-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quick add a task" aria-label="Quick add task" />
        <button className="harbor-btn harbor-btn-brand" type="submit">Add task</button>
      </form>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Today’s appointments">
          <List items={todayEvents.map((e) => e.title)} empty="No appointments today." />
        </Card>
        <Card title="Today’s tasks">
          {todayTasks.length === 0 ? <p className="text-sm text-[var(--muted)]">No tasks due today.</p> : todayTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 last:border-0">
              <div>
                <p className="font-medium">{task.title}</p>
                <p className="text-xs uppercase tracking-wide text-[var(--faint)]">{task.priority} · {task.durationMin}m</p>
              </div>
              <button type="button" className="harbor-btn" onClick={() => void complete(task.id)}>Done</button>
            </div>
          ))}
        </Card>
        <Card title="Overdue">
          <List items={data.overdue.map((t) => t.title)} empty="Nothing overdue." />
        </Card>
        <Card title="At risk / important">
          <List items={data.important.map((t) => `${t.title} (${t.priority})`)} empty="No high-priority work." />
        </Card>
        <Card title="Next three days">
          <List items={data.range.days.slice(0, 3).flatMap((day) => {
            const names = [
              ...data.events.filter((e) => dayOf(e.startAt) === day).map((e) => e.title),
              ...data.tasks.filter((t) => dayOf(t.dueAt) === day || dayOf(t.startAt) === day).map((t) => t.title),
            ];
            return names.length ? [`${day}: ${names.join(', ')}`] : [`${day}: clear`];
          })} empty="" />
        </Card>
        <Card title="Calendar preview">
          <List items={data.events.slice(0, 5).map((e) => e.title)} empty="No upcoming events." />
        </Card>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="harbor-card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--faint)]">{title}</h2>
      {children}
    </section>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}
