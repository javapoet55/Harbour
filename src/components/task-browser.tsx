'use client';

import { useEffect, useState } from 'react';

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  startAt: string | null;
  dueAt: string | null;
  waitingOn: string | null;
  durationMin: number;
};

export function TaskBrowser({ filter }: { filter?: (task: Task) => boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/tasks');
    if (!res.ok) {
      setError('Could not load tasks.');
      return;
    }
    const data = await res.json();
    setTasks(data.tasks);
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tasks')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((data: { tasks: Task[] }) => {
        if (!cancelled) setTasks(data.tasks);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load tasks.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = filter ? tasks.filter(filter) : tasks;

  async function act(id: string, body: Record<string, unknown>) {
    await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await load();
  }

  if (error) return <p className="text-[var(--danger)]">{error}</p>;

  if (!shown.length) {
    return <div className="harbor-card p-6 text-[var(--muted)]">Nothing in this list yet.</div>;
  }

  return (
    <div className="harbor-card divide-y divide-[var(--line)]">
      {shown.map((task) => (
        <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-medium">{task.title}</p>
            <p className="text-xs uppercase tracking-wide text-[var(--faint)]">
              {task.status} · {task.priority} · {task.durationMin}m
              {task.waitingOn ? ` · waiting on ${task.waitingOn}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="harbor-btn" onClick={() => void act(task.id, { status: 'IN_PROGRESS' })}>Start</button>
            <button type="button" className="harbor-btn" onClick={() => void act(task.id, { status: 'COMPLETED' })}>Complete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
