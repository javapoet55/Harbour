'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Authed } from '@/components/authed';

type InsightData = {
  enabled: boolean; message?: string;
  durationInsights?: Array<{ category: string; estimatedMedian: number; actualMedian: number; samples: number; confidence: string; explanation: string }>;
  completion?: { overallRate: number | null; samples: number; predictions: Array<{ taskId: string; title: string; probability: number; confidence: string; factors: string[] }>; lateDay: { explanation: string } };
  preferredTime?: { bucket: string; rate: number; samples: number; confidence: string } | null;
  preferredTimesByCategory?: Array<{ category: string; bucket: string; rate: number; samples: number; confidence: string }>;
  postponement?: { tasksPostponed: number; totalPostponements: number; samples: number; likelihood: number | null; byCategory: Array<{ category: string; likelihood: number; samples: number }> };
  reminders?: { preferredChannel: { channel: string; score: number; samples: number } | null; bestTimingMinutes: number | null; timingSamples: number };
  patterns?: { interruptionsLast30Days: number; overtimeRate: number | null; overtimeSessions: number; sessionSamples: number };
  capacity?: { realisticDailyMinutes: number | null; sampleDays: number; configuredDailyMinutes: number };
  deadlineRisk?: { atRisk: boolean; requiredMinutes: number; availableMinutes: number; deficitMinutes: number; taskCount: number; explanation: string };
};

function Confidence({ value, samples }: { value: string; samples: number }) {
  return <span className="text-xs text-[var(--faint)]">{value} confidence · {samples} sample{samples === 1 ? '' : 's'}</span>;
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightData | null>(null);
  useEffect(() => { let cancelled = false; fetch('/api/insights').then((r) => r.json()).then((value) => { if (!cancelled) setData(value); }); return () => { cancelled = true; }; }, []);
  if (!data) return <Authed><p>Calculating personalized insights…</p></Authed>;
  if (!data.enabled) return <Authed><h1 className="text-3xl font-semibold">Personal Insights</h1><section className="harbor-card mt-5 p-5"><p>{data.message}</p><Link className="harbor-btn harbor-btn-brand mt-4 inline-block" href="/settings">Review consent settings</Link></section></Authed>;
  return (
    <Authed>
      <h1 className="text-3xl font-semibold">Personal Insights</h1>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">Interpretable estimates based only on your own activity. Low-sample predictions are directional, not guarantees.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="harbor-card p-5"><h2 className="font-semibold">Deadline capacity</h2><p className={`mt-2 text-lg ${data.deadlineRisk?.atRisk ? 'text-[var(--danger)]' : 'text-[var(--ok)]'}`}>{data.deadlineRisk?.atRisk ? `${data.deadlineRisk.deficitMinutes} minutes over capacity` : 'Work fits available capacity'}</p><p className="mt-1 text-sm text-[var(--muted)]">{data.deadlineRisk?.explanation}</p></section>
        <section className="harbor-card p-5"><h2 className="font-semibold">Realistic daily capacity</h2><p className="mt-2 text-lg">{data.capacity?.realisticDailyMinutes ?? 'Learning…'} {data.capacity?.realisticDailyMinutes ? 'minutes/day' : ''}</p><p className="text-sm text-[var(--muted)]">Configured: {data.capacity?.configuredDailyMinutes} minutes · observed across {data.capacity?.sampleDays} days</p></section>
        <section className="harbor-card p-5"><h2 className="font-semibold">Duration calibration</h2>{data.durationInsights?.length ? <div className="mt-3 space-y-3">{data.durationInsights.slice(0, 5).map((item) => <div key={item.category}><p className="text-sm">{item.explanation}</p><Confidence value={item.confidence} samples={item.samples} /></div>)}</div> : <p className="mt-2 text-sm text-[var(--muted)]">Complete timed work sessions to calibrate estimates.</p>}</section>
        <section className="harbor-card p-5"><h2 className="font-semibold">Best working time</h2>{data.preferredTime ? <><p className="mt-2 text-lg capitalize">{data.preferredTime.bucket}</p><p className="text-sm">Predicted on-time completion: {data.preferredTime.rate}%</p><Confidence value={data.preferredTime.confidence} samples={data.preferredTime.samples} />{data.preferredTimesByCategory?.slice(0, 4).map((item) => <p key={item.category} className="mt-2 text-xs">{item.category}: {item.bucket} ({item.rate}%, {item.samples} samples)</p>)}</> : <p className="mt-2 text-sm text-[var(--muted)]">Not enough scheduled outcomes yet.</p>}<p className="mt-3 text-sm text-[var(--muted)]">{data.completion?.lateDay.explanation}</p></section>
        <section className="harbor-card p-5"><h2 className="font-semibold">Reminder learning</h2><p className="mt-2">Preferred channel: <strong>{data.reminders?.preferredChannel?.channel ?? 'Learning…'}</strong></p><p className="text-sm text-[var(--muted)]">Best observed lead time: {data.reminders?.bestTimingMinutes ?? '—'} minutes ({data.reminders?.timingSamples} acknowledged reminders)</p></section>
        <section className="harbor-card p-5"><h2 className="font-semibold">Patterns</h2><p className="mt-2 text-sm">{data.postponement?.totalPostponements} postponements across {data.postponement?.tasksPostponed} tasks</p><p className="text-sm">Estimated postponement likelihood: {data.postponement?.likelihood ?? '—'}%</p>{data.postponement?.byCategory.slice(0, 3).map((item) => <p key={item.category} className="text-xs text-[var(--muted)]">{item.category}: {item.likelihood}% ({item.samples} samples)</p>)}<p className="mt-2 text-sm">{data.patterns?.interruptionsLast30Days} schedule interruptions in 30 days</p><p className="text-sm">Overtime rate: {data.patterns?.overtimeRate ?? '—'}% across {data.patterns?.sessionSamples} sessions</p></section>
      </div>
      <section className="harbor-card mt-4 p-5"><h2 className="font-semibold">Tasks needing attention</h2>{data.completion?.predictions.length ? <div className="mt-3 space-y-3">{data.completion.predictions.slice(0, 10).map((task) => <div key={task.taskId} className="border-b border-[var(--line)] pb-3 last:border-0"><div className="flex justify-between gap-3"><p>{task.title}</p><strong>{task.probability}%</strong></div><p className="text-xs text-[var(--muted)]">Estimated on-time completion · {task.factors.join(' · ')}</p><Confidence value={task.confidence} samples={data.completion!.samples} /></div>)}</div> : <p className="mt-2 text-sm text-[var(--muted)]">No open tasks to score.</p>}</section>
    </Authed>
  );
}
