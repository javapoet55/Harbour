'use client';

import { FormEvent, KeyboardEvent, useRef, useState } from 'react';
import { Bot, Database, LoaderCircle, Send, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AdminAnswerChart } from '@/contract/insights';

function prompts(days: number) { return [
  `Summarize platform usage for the selected ${days === 1 ? 'day' : `${days}-day period`}.`,
  'Which features are used most, and what should I watch?',
  'How is voice usage changing compared with the previous period?',
]; }

export function AdminDataAssistant({ days, from, to }: { days: number; from: string; to: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generatedAt, setGeneratedAt] = useState('');
  const [chart, setChart] = useState<AdminAnswerChart | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (value.length < 3 || busy) return;
    setBusy(true);
    setError('');
    setAnswer('');
    setChart(null);
    try {
      const response = await fetch('/api/admin/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: value, days, from, to }),
      });
      // The proxy has already cleared an expired session cookie.
      if (response.status === 401) { router.replace('/login'); return; }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The question could not be answered.');
      setAnswer(body.answer);
      setChart(body.chart ?? null);
      setGeneratedAt(body.generatedAt || '');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The question could not be answered.');
    } finally {
      setBusy(false);
    }
  }

  function choosePrompt(prompt: string) {
    setQuestion(prompt);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    form.current?.requestSubmit();
  }

  return <section className="admin-data-assistant" aria-labelledby="admin-data-assistant-title">
    <div className="admin-data-assistant-heading">
      <span><Sparkles size={21}/></span>
      <div>
        <h2 id="admin-data-assistant-title">Ask Nexdo about your data</h2>
        <p>Get grounded answers from live Admin analytics. The assistant is read-only.</p>
      </div>
      <div className="admin-data-badge"><Database size={14}/> Live database</div>
    </div>
    <form ref={form} onSubmit={submit} className="admin-data-form">
      <label htmlFor="admin-data-question" className="admin-sr-only">Ask a question about Nexdo usage data</label>
      <textarea
        ref={textarea}
        id="admin-data-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={submitOnEnter}
        placeholder="Ask about users, plans, AI actions, voice usage, features, or estimated revenue…"
        maxLength={600}
        rows={2}
        disabled={busy}
      />
      <button type="submit" disabled={busy || question.trim().length < 3}>
        {busy ? <LoaderCircle className="admin-spin" size={18}/> : <Send size={18}/>}
        {busy ? 'Analyzing…' : 'Ask Nexdo'}
      </button>
    </form>
    <div className="admin-data-prompts" aria-label="Suggested questions">
      {prompts(days).map((prompt) => <button type="button" key={prompt} onClick={() => choosePrompt(prompt)} disabled={busy}>{prompt}</button>)}
    </div>
    {(answer || error) && <div className={`admin-data-answer${error ? ' error' : ''}`} role="status" aria-live="polite">
      <div className="admin-data-answer-icon"><Bot size={20}/></div>
      <div>
        <strong>{error ? 'Unable to answer' : 'Nexdo analysis'}</strong>
        <p>{error || answer}</p>
        {!error && chart && <AdminInsightChart chart={chart}/>}
        {!error && generatedAt && <small>Based on Admin data refreshed {new Date(generatedAt).toLocaleString()}.</small>}
      </div>
    </div>}
  </section>;
}

function AdminInsightChart({ chart }: { chart: AdminAnswerChart }) {
  const labels = [...new Set(chart.series.flatMap((series) => series.data.map((point) => point.label)))];
  const labelLimit = labels.length <= 6 ? 20 : labels.length <= 10 ? 12 : 8;
  const values = chart.series.flatMap((series) => series.data.map((point) => point.value));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const width = 720;
  const height = 250;
  const left = 42;
  const top = 18;
  const plotWidth = 650;
  const plotHeight = 180;
  const y = (value: number) => top + plotHeight - ((value - min) / range) * plotHeight;
  const x = (index: number) => left + (labels.length === 1 ? plotWidth / 2 : index / (labels.length - 1) * plotWidth);
  const barGroup = plotWidth / Math.max(labels.length, 1);
  const barWidth = Math.max(3, Math.min(28, barGroup * .72 / chart.series.length));
  return <figure className="admin-insight-chart">
    <figcaption><strong>{chart.title}</strong><span>{chart.yLabel}</span></figcaption>
    <div className="admin-insight-chart-legend">{chart.series.map((series) => <span key={series.name}><i style={{ background: series.color }}/>{series.name}</span>)}</div>
    <div className="admin-insight-chart-canvas">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title} preserveAspectRatio="xMidYMid meet">
      {[0, .25, .5, .75, 1].map((ratio) => <line key={ratio} x1={left} x2={left + plotWidth} y1={top + ratio * plotHeight} y2={top + ratio * plotHeight} className="admin-insight-grid"/>)}
      {chart.type === 'line' ? chart.series.map((series) => {
        const points = labels.map((label, index) => ({ label, index, value: series.data.find((point) => point.label === label)?.value ?? 0 }));
        return <g key={series.name}><polyline points={points.map((point) => `${x(point.index)},${y(point.value)}`).join(' ')} fill="none" stroke={series.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{points.map((point) => <circle key={point.label} cx={x(point.index)} cy={y(point.value)} r="4" fill={series.color}><title>{`${point.label}: ${point.value}`}</title></circle>)}</g>;
      }) : chart.series.flatMap((series, seriesIndex) => labels.map((label, labelIndex) => {
        const value = series.data.find((point) => point.label === label)?.value ?? 0;
        const barHeight = Math.max(1, plotHeight - y(value) + top);
        const groupStart = left + labelIndex * barGroup + (barGroup - barWidth * chart.series.length) / 2;
        return <rect key={`${series.name}-${label}`} x={groupStart + seriesIndex * barWidth} y={y(value)} width={barWidth} height={barHeight} rx="3" fill={series.color}><title>{`${series.name} · ${label}: ${value}`}</title></rect>;
      }))}
      {labels.map((label, index) => <text key={label} x={chart.type === 'bar' ? left + index * barGroup + barGroup / 2 : x(index)} y={225} textAnchor="middle" className="admin-insight-axis-label">
        <title>{label}</title>
        {label.length > labelLimit ? `${label.slice(0, labelLimit - 1)}…` : label}
      </text>)}
      <text x={left + plotWidth / 2} y={246} textAnchor="middle" className="admin-insight-axis-title">{chart.xLabel}</text>
    </svg>
    </div>
  </figure>;
}
