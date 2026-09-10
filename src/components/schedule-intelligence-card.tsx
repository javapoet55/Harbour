'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { splitSectionItem } from '@/lib/assistant-sections';

type Conflict = { id: string; type: string; severity: string; title: string; explanation: string; recommendedAction: string; confidence: number };
type Proposal = { actionId: string | null; moves: Array<{ taskId: string; title: string; fromLabel: string; toLabel: string; reasonLabel: string }>; risks: Array<{ taskId: string; title: string; reason: string }>; spoken: string };
type Intelligence = { conflicts: Conflict[]; commitmentsToday: number; availableMinutes: number; priorities: Array<{ title: string; score: number }>; };

export function ScheduleIntelligenceCard({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<Intelligence | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; fetch('/api/schedule-intelligence').then((res) => res.json()).then((payload) => { if (active) setData(payload); }).catch(() => { if (active) setMessage('Schedule intelligence is temporarily unavailable.'); }); return () => { active = false; }; }, []);
  const attention = data?.conflicts.length ?? 0;
  async function propose() {
    setBusy(true); setMessage('');
    try { const res = await fetch('/api/schedule-intelligence', { method: 'POST' }); const payload = await res.json(); if (!res.ok) throw new Error(payload.error || 'Could not create a proposal.'); setProposal(payload.proposal); setExpanded(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create a proposal.'); } finally { setBusy(false); }
  }
  async function apply() {
    if (!proposal?.actionId) return;
    setBusy(true); setMessage('');
    try { const res = await fetch('/api/planner/replan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: proposal.actionId }) }); const payload = await res.json(); if (!res.ok) throw new Error(payload.error || 'Could not apply the proposal.'); setMessage(`Updated ${payload.moved} Harbor task${payload.moved === 1 ? '' : 's'}.`); setProposal(null); onChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not apply the proposal.'); } finally { setBusy(false); }
  }
  if (!data && !message) return null;
  const compactLines = (value: string) => splitSectionItem(value);
  const compactParagraphs = (value: string) => compactLines(value).map((line, index) => <p key={`${value}-${index}`}>{line}</p>);
  return <section className="schedule-intelligence" aria-label="Schedule Intelligence">
    <header><span><Sparkles size={19} /><strong>Schedule Intelligence</strong></span><button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide details' : 'Review conflicts'}{expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button></header>
    <div className="schedule-intelligence-summary"><AlertTriangle size={21} /><div><strong>{attention ? `${attention} thing${attention === 1 ? '' : 's'} need your attention` : 'Your schedule is in good shape'}</strong><p>{data ? `${data.commitmentsToday} calendar commitments today · ${Math.round(data.availableMinutes / 60 * 10) / 10} usable hours remain${data.priorities[0] ? ` · Top priority: ${data.priorities[0].title}` : ''}` : message}</p></div></div>
    {expanded && <div className="schedule-intelligence-details">
      {data?.conflicts.length ? data.conflicts.map((conflict) => (
        <article key={conflict.id} className={`schedule-conflict severity-${conflict.severity.toLowerCase()}`}>
          <p><b>{conflict.title}</b><span>{conflict.type.toLowerCase()} · {Math.round(conflict.confidence * 100)}% confidence</span></p>
          <div>{compactParagraphs(conflict.explanation)}</div>
          <small>Recommended:</small><div>{compactParagraphs(conflict.recommendedAction)}</div>
        </article>
      )) : <p className="schedule-clear">No overlap, travel-buffer, workload, or priority conflicts were found.</p>}
      {proposal && <div className="schedule-proposal">
        <h3>Proposed changes</h3>
        <p>Nothing changes until you approve. Connected calendar events are recommendations only.</p>
        {proposal.moves.length ? proposal.moves.map((move) => {
          const reasonLines = compactLines(`Reason: ${move.reasonLabel}`);
          return (
            <article key={move.taskId} className="mb-2">
              <p><strong>{move.title}</strong></p>
              <div>{compactParagraphs(`${move.fromLabel} → ${move.toLabel}`)}</div>
              <div>{reasonLines.map((line, index) => <p key={`${move.taskId}-reason-${index}`} className="text-xs text-[var(--muted)]">{line}</p>)}</div>
            </article>
          );
        }) : <p>No Harbor task moves are needed.</p>}
        {proposal.risks.length ? <div className="mt-2"><p className="font-semibold">Risk notes</p><ul>{proposal.risks.map((risk) => {
          const riskLines = compactLines(`${risk.title}: ${risk.reason === 'no_capacity' ? 'still needs a time block' : 'may miss its deadline'}`);
          return <li key={risk.taskId}>{riskLines.map((line, index) => <p key={`${risk.taskId}-risk-${index}`}>{line}</p>)}</li>;
        })}</ul></div> : null}
        {proposal.actionId && <button type="button" className="harbor-btn harbor-btn-brand" disabled={busy} onClick={() => void apply()}>{busy ? 'Applying…' : `Approve ${proposal.moves.length} task change${proposal.moves.length === 1 ? '' : 's'}`}</button>}
      </div>}
    </div>}
    {!proposal && <button type="button" className="schedule-fix" disabled={busy} onClick={() => void propose()}>{busy ? 'Preparing proposal…' : 'Fix my schedule'}</button>}
    {message && <p role="status" className="schedule-message">{message}</p>}
  </section>;
}
