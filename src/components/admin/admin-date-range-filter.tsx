'use client';

import { FormEvent, useRef, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = { from: string; to: string; label: string; today: string; pathname?: string };

function shifted(today: string, days: number) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date.toISOString().slice(0, 10);
}

export function AdminDateRangeFilter({ from: initialFrom, to: initialTo, label, today, pathname = '/admin/users' }: Props) {
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [error, setError] = useState('');

  function navigate(nextFrom: string, nextTo: string) {
    setError('');
    if (!nextFrom || !nextTo || nextFrom > nextTo) { setError('Choose a valid start and end date.'); return; }
    const days = Math.floor((+new Date(`${nextTo}T00:00:00Z`) - +new Date(`${nextFrom}T00:00:00Z`)) / 86_400_000) + 1;
    if (days > 366) { setError('Choose a range of 366 days or less.'); return; }
    details.current?.removeAttribute('open');
    router.push(`${pathname}?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`);
  }

  function apply(event: FormEvent) { event.preventDefault(); navigate(from, to); }

  return <details ref={details} className="admin-range-filter">
    <summary><CalendarDays size={16}/><span>{label}</span><ChevronDown size={15}/></summary>
    <div className="admin-range-popover">
      <strong>Filter reporting period</strong>
      <div className="admin-range-presets">
        {[1, 7, 15, 30, 90].map((days) => <button type="button" key={days} onClick={() => navigate(shifted(today, days), today)}>{days === 1 ? 'Today' : `Last ${days} days`}</button>)}
      </div>
      <form onSubmit={apply}>
        <label>From<input type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)}/></label>
        <label>To<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)}/></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Apply range</button>
      </form>
    </div>
  </details>;
}
