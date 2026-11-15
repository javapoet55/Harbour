'use client';

import { FormEvent, KeyboardEvent, useRef, useState } from 'react';
import { BarChart3, Bot, Bug, ChevronDown, ChevronRight, Layers3, LoaderCircle, Search, Send, Sparkles, TrendingUp, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AdminAnswerChart } from '@/contract/insights';

const prompts = [
  'Show the Amplitude page-view to form-submission funnel with a 24-hour conversion window.',
  'What are Amplitude day-1, day-7 and day-30 retention rates for new users?',
  'Which first-touch sources and campaigns bring active users in Amplitude?',
  'Summarize Firebase engagement: active users, sessions, and most-used screens.',
  'Show Amplitude daily active and new users for the selected period.',
  'Compare Firebase and Amplitude trends, keeping their audiences separate.',
  'What percentage of new users complete their first task within two minutes?',
  'Where do users drop off during onboarding?',
  'What are our day-1, day-7, and day-30 retention rates?',
  'Which screens and features have declining engagement?',
  'Which app versions have the most crashes or failed actions?',
  'What are the most common reported bugs?',
  'How much does AI cost per active user?',
  'Summarize activity for the selected period compared with the previous period.',
  'Which features are used most and least?',
  'How are signups trending?',
  'How many users are on Free, Pro, and Max?',
  'How has voice usage changed?',
  'Who are the top 10 users by AI actions or voice minutes?',
  'Show activity for a specific user by email address.',
  'What is estimated monthly revenue by plan? Use plan-based estimates, not verified payments.',
];

const categories = [
  { id: 'all', label: 'Suggested Questions', icon: Sparkles, prompts: prompts.map((_, index) => index) },
  { id: 'engagement', label: 'Engagement', icon: Users, prompts: [2, 3, 4, 5, 9, 19] },
  { id: 'retention', label: 'Retention', icon: TrendingUp, prompts: [1, 6, 7, 8] },
  { id: 'usage', label: 'Usage', icon: BarChart3, prompts: [0, 4, 13, 14, 15, 16, 17, 18] },
  { id: 'bugs', label: 'Bugs & Issues', icon: Bug, prompts: [10, 11] },
  { id: 'costs', label: 'AI Costs', icon: Layers3, prompts: [12, 18, 20] },
];
const topics = [
  { category: 'usage', title: 'Get insights', copy: 'Usage, growth, trends', icon: BarChart3, tone: 'blue' },
  { category: 'engagement', title: 'Understand engagement', copy: 'Active users, retention, cohorts', icon: Users, tone: 'purple' },
  { category: 'bugs', title: 'Investigate issues', copy: 'Bugs, errors, performance', icon: Bug, tone: 'green' },
  { category: 'summary', title: 'AI summaries', copy: 'Activity and period comparisons', icon: Sparkles, tone: 'orange' },
];

export function AdminDataAssistant({ days, from, to }: { days: number; from: string; to: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [category, setCategory] = useState('all');
  const [showMore, setShowMore] = useState(false);
  const selected = categories.find((item) => item.id === category) ?? categories[0];
  const visiblePrompts = selected.prompts.slice(0, showMore ? undefined : 9);
  function chooseCategory(id: string) {
    setCategory(id);
    setShowMore(false);
  }
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

  return <>
    <div className="admin-ask-topics" aria-label="Explore your analytics">
      {topics.map(({ category: id, title, copy, icon: Icon, tone }) => <button
        key={id} type="button" className={`admin-ask-topic ${tone}`} disabled={busy}
        aria-pressed={id === 'summary' ? undefined : category === id}
        onClick={() => id === 'summary' ? choosePrompt(prompts[13]) : chooseCategory(id)}>
        <span className="admin-ask-topic-icon"><Icon size={23} aria-hidden="true"/></span>
        <span><strong>{title}</strong><small>{copy}</small></span>
      </button>)}
    </div>
    <section className="admin-data-assistant" aria-labelledby="admin-data-assistant-title">
    <div className="admin-data-assistant-heading">
      <span><Sparkles size={21}/></span>
      <div>
        <h2 id="admin-data-assistant-title">Ask Nexdo about your data</h2>
        <p>Ask about database activity, Firebase/GA4 engagement, and Amplitude trends. The assistant is read-only.</p>
      </div>
      <div className="admin-data-badge"><BarChart3 size={15}/> Analytics sources</div>
    </div>
    <form ref={form} onSubmit={submit} className="admin-data-form">
      <label htmlFor="admin-data-question" className="admin-sr-only">Ask a question about Nexdo usage data</label>
      <div className="admin-ask-input"><Search aria-hidden="true" size={21}/><textarea
        ref={textarea}
        id="admin-data-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={submitOnEnter}
        placeholder="Choose a prompt below or ask about activation, retention, engagement, bugs, or AI costs…"
        aria-describedby="admin-data-question-help"
        maxLength={600}
        rows={1}
        disabled={busy}
      /></div>
      <button type="submit" disabled={busy || question.trim().length < 3}>
        {busy ? <LoaderCircle className="admin-spin" size={18}/> : <Send size={18}/>}
        {busy ? 'Analyzing…' : 'Ask Nexdo'}
      </button>
    </form>
    <p id="admin-data-question-help">Choose a question to edit, then press Enter to ask. Shift+Enter adds a new line.</p>
    </section>
    {(answer || error) && <div className={`admin-data-answer${error ? ' error' : ''}`} role="status" aria-live="polite">
      <div className="admin-data-answer-icon"><Bot size={20}/></div>
      <div>
        <strong>{error ? 'Unable to answer' : 'Nexdo analysis'}</strong>
        <p>{error || answer}</p>
        {!error && chart && <AdminInsightChart chart={chart}/>}
        {!error && generatedAt && <small>Analysis started {new Date(generatedAt).toLocaleString()}. Provider freshness is included in the answer.</small>}
      </div>
    </div>}
    <section className="admin-ask-suggestions" aria-label="Question suggestions">
      <div className="admin-ask-categories" role="group" aria-label="Question categories">
        {categories.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={category === id} onClick={() => chooseCategory(id)}>
          <Icon size={17} aria-hidden="true"/>{label}
        </button>)}
      </div>
      <div className="admin-data-prompts" aria-label="Suggested questions">
        {visiblePrompts.map((index) => {
          const Icon = (category === 'all' ? categories.slice(1).find(item => item.prompts.includes(index)) : selected)?.icon ?? Sparkles;
          return <button type="button" key={index} onClick={() => choosePrompt(prompts[index])} disabled={busy}>
            <span className="admin-ask-prompt-icon"><Icon size={20} aria-hidden="true"/></span>
            <span>{prompts[index]}</span><ChevronRight size={17} aria-hidden="true"/>
          </button>;
        })}
      </div>
      {selected.prompts.length > 9 && <button className="admin-ask-more" type="button" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
        {showMore ? 'Show fewer questions' : 'Show more questions'}<ChevronDown size={17} aria-hidden="true"/>
      </button>}
    </section>
  </>;
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
