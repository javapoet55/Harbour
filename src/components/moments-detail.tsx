'use client';

import { useState } from 'react';
import { CalendarClock, Mail, Pencil, Send, Sparkles } from 'lucide-react';
import {
  CONTEXT_LIMIT, TONES, WISH_LIMIT, activePlan, allPlans, dayLabel, emailBlocker, instantLabel, latestDraft, momentState, planDate, planEditable, planStatusLabel,
  readyToSchedule, relativeDay, typeLabel, upcomingDelivery, wishIssue, type ImportantMoment, type WishDeliveryPlan,
} from '@/lib/moments';
import type { MomentsApi } from './use-moments';
import { ConfirmDialog, Sheet } from './shopping-sheets';
import { ScheduleSheet } from './moments-sheets';
import './tasks-screen.css';
import './moments.css';

type Pending = { kind: 'cancel' | 'sendNow' | 'notSent' | 'sent'; plan: WishDeliveryPlan } | null;

const CONFIRM: Record<NonNullable<Pending>['kind'], { title: string; message: string; label: string; destructive: boolean }> = {
  cancel: { title: 'Cancel this email?', message: 'It will not be sent. Your approved wish stays, so you can schedule it again.', label: 'Cancel email', destructive: true },
  sendNow: { title: 'Send it now?', message: 'Nexdo sends this wish from your connected Gmail straight away. This cannot be undone.', label: 'Send now', destructive: false },
  notSent: { title: 'Mark as not sent?', message: 'Use this only if you checked Gmail’s Sent folder and the email is not there. You can then retry or move it.', label: 'Not sent', destructive: false },
  sent: { title: 'Mark as sent?', message: 'Use this only if you found the email in Gmail’s Sent folder.', label: 'It was sent', destructive: false },
};

function PlanRow({ plan, zone, busy, onAction }: { plan: WishDeliveryPlan; zone: string; busy: boolean; onAction: (action: 'cancel' | 'reschedule' | 'retry' | 'sendNow' | 'notSent' | 'sent', plan: WishDeliveryPlan) => void }) {
  const status = plan.status;
  const editable = planEditable(plan);
  return <li className="mo-plan">
    <div>
      <strong>{planStatusLabel(plan)}</strong>
      <small>{instantLabel(planDate(plan), plan.timeZoneID || zone)} · to {plan.recipient}{plan.repeatYearly ? ' · every year' : ''}</small>
      {plan.lastError && ['FAILED', 'UNCERTAIN', 'CANCELLED'].includes(status) && <small className="mo-plan-error">{plan.lastError}</small>}
      {status === 'UNCERTAIN' && <small>Nexdo could not confirm this email went out. Look in Gmail’s Sent folder, then tell Nexdo what you found.</small>}
    </div>
    <div className="mo-plan-actions">
      {status === 'FAILED' && plan.automaticDelivery && <button type="button" disabled={busy} onClick={() => onAction('retry', plan)}>Retry</button>}
      {editable && <button type="button" disabled={busy} onClick={() => onAction('reschedule', plan)}>Move</button>}
      {editable && <button type="button" disabled={busy} onClick={() => onAction('sendNow', plan)}>Send now</button>}
      {editable && <button type="button" className="mo-danger" disabled={busy} onClick={() => onAction('cancel', plan)}>Cancel</button>}
      {status === 'UNCERTAIN' && <>
        <button type="button" disabled={busy} onClick={() => onAction('sent', plan)}>It was sent</button>
        <button type="button" disabled={busy} onClick={() => onAction('notSent', plan)}>Not sent</button>
      </>}
    </div>
  </li>;
}

/** One moment: its details, the wish (write, edit, approve) and the email schedule with cancel, move, send now and retry. */
export function MomentDetailSheet({ momentID, moments, onEdit, onClose }: { momentID: string; moments: MomentsApi; onEdit: (moment: ImportantMoment) => void; onClose: () => void }) {
  const moment = moments.moments.find((item) => item.id === momentID);
  const [edited, setEdited] = useState<string | null>(null);
  const [tone, setTone] = useState<string>('Warm');
  const [context, setContext] = useState('');
  const [consent, setConsent] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [moving, setMoving] = useState<WishDeliveryPlan | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useState('');
  const [wishError, setWishError] = useState('');

  if (!moment) return null;
  const draft = latestDraft(moment);
  const locked = activePlan(moment) !== undefined;
  const body = edited ?? draft?.body ?? '';
  const approved = draft?.status === 'READY' && body === draft.body;
  const blocker = emailBlocker(moments);
  const plans = allPlans(moment).sort((a, b) => planDate(b) - planDate(a));
  const upcoming = upcomingDelivery(moment);
  const state = momentState(moment);
  const busy = moments.busy;

  async function generate() {
    setWishError('');
    setNotice('');
    const result = await moments.generate({ momentID: moment!.id, tone, personalContext: context.trim(), aiConsent: consent, shared: false });
    if (result.ok) {
      setEdited(null);
      setNotice(result.value.usedAI ? 'Here is a draft. Edit it, then approve it.' : 'Here is a simple draft. Edit it, then approve it.');
    }
  }

  async function approve() {
    setWishError('');
    const issue = wishIssue(body);
    if (issue) return setWishError(issue);
    if (!draft) return;
    const result = await moments.approve(draft.id, body.trim());
    if (result.ok) {
      setEdited(null);
      setNotice('Wish approved. You can schedule it now.');
    }
  }

  async function confirm() {
    if (!pending) return;
    const { kind, plan } = pending;
    const action = kind === 'notSent' ? 'failed' : kind;
    const result = await moments.changePlan(plan.id, action);
    if (result.ok) {
      setPending(null);
      setNotice(kind === 'cancel' ? 'Email cancelled.' : kind === 'sendNow' ? 'Sending now.' : 'Updated.');
    }
  }

  async function act(action: 'cancel' | 'reschedule' | 'retry' | 'sendNow' | 'notSent' | 'sent', plan: WishDeliveryPlan) {
    moments.clearError();
    setNotice('');
    if (action === 'reschedule') return setMoving(plan);
    if (action === 'retry') {
      const result = await moments.changePlan(plan.id, 'retry');
      if (result.ok) setNotice('Retrying now.');
      return;
    }
    setPending({ kind: action, plan });
  }

  return <>
    <Sheet title={moment.title} onClose={onClose} busy={busy}>
      <div className="mo-summary">
        <span className="mo-badge">{typeLabel(moment.type)}</span>
        <span className={`mo-state is-${state.state}`}>{state.label}</span>
        <p>{dayLabel(moment.nextOccurrence)} · {relativeDay(moment.nextOccurrence, moment.timeZoneID)}{moment.yearly ? ' · every year' : ''}</p>
        <p className="mo-muted">{[moment.firstName, moment.email, moment.phone].filter(Boolean).join(' · ') || 'No recipient details yet'}</p>
        <button type="button" className="nx-outline-button" disabled={busy || locked} onClick={() => onEdit(moment)}><Pencil size={16} aria-hidden="true" /> Edit moment</button>
        {locked && <p className="nx-hint">Cancel the scheduled email to edit this moment.</p>}
      </div>

      {notice && <p className="nx-notice" role="status">{notice}</p>}
      {moments.error && <p role="alert" className="nx-sheet-error">{moments.error}</p>}

      <h3 className="mo-section">THE WISH</h3>
      {locked
        ? <div className="mo-wish-locked"><p>{draft?.body}</p><small>This wish is scheduled. Cancel the email below to change it.</small></div>
        : <div className="nx-form-card">
          <div>
            <label className="nx-label" htmlFor="mo-wish">WISH TEXT</label>
            <textarea id="mo-wish" className="nx-field" rows={6} maxLength={WISH_LIMIT + 200} disabled={busy || !draft} placeholder={draft ? '' : 'Write a wish below to start.'}
              value={body} onChange={(event) => { setEdited(event.target.value); setWishError(''); }} />
            <p className={`mo-count ${body.trim().length > WISH_LIMIT ? 'is-over' : ''}`}>{body.trim().length}/{WISH_LIMIT}</p>
          </div>
          <hr />
          <div className="sp-two">
            <div>
              <label className="nx-label" htmlFor="mo-tone">TONE</label>
              <select id="mo-tone" className="nx-field" value={tone} disabled={busy} onChange={(event) => setTone(event.target.value)}>
                {TONES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>
          <hr />
          <div>
            <label className="nx-label" htmlFor="mo-context">ANYTHING TO MENTION? (OPTIONAL)</label>
            <textarea id="mo-context" className="nx-field" rows={2} maxLength={CONTEXT_LIMIT} disabled={busy} placeholder="A shared memory, an inside joke, a milestone…" value={context} onChange={(event) => setContext(event.target.value)} />
          </div>
          <hr />
          <label className="nx-form-row"><span>Let Nexdo’s AI write it</span><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} /></label>
          <p className="nx-hint">With this on, the name, occasion and your note above are sent to our AI provider to write the draft. Without it, Nexdo fills in a simple template.</p>
        </div>}
      {!locked && <div className="mo-actions">
        <button type="button" className="nx-outline-button" disabled={busy} onClick={() => void generate()}><Sparkles size={16} aria-hidden="true" /> {draft ? 'Write a new draft' : 'Write a wish'}</button>
        <button type="button" className="nx-primary mo-approve" disabled={busy || !draft || approved || body.trim() === ''} onClick={() => void approve()}>{approved ? 'Approved' : busy ? 'Saving…' : 'Approve wish'}</button>
      </div>}
      {wishError && <p role="alert" className="nx-sheet-error">{wishError}</p>}

      <h3 className="mo-section">EMAIL</h3>
      {plans.length > 0 && <ul className="mo-plans" aria-label="Deliveries">{plans.map((plan) => <PlanRow key={plan.id} plan={plan} zone={moment.timeZoneID} busy={busy} onAction={(action, target) => void act(action, target)} />)}</ul>}
      {!upcoming && readyToSchedule(moment) && (blocker
        ? <div className="mo-blocker"><Mail size={18} aria-hidden="true" /><p>{blocker}</p></div>
        : <button type="button" className="nx-primary mo-schedule" disabled={busy} onClick={() => { moments.clearError(); setScheduling(true); }}><CalendarClock size={18} aria-hidden="true" /> Schedule email</button>)}
      {!upcoming && !readyToSchedule(moment) && plans.length === 0 && <p className="nx-hint"><Send size={14} aria-hidden="true" /> Approve a wish to schedule it as an automatic email.</p>}
      {moments.emailAccount && <p className="nx-hint">Sends from {moments.emailAccount.email}.</p>}
    </Sheet>

    {scheduling && draft && <ScheduleSheet moment={moment} plan={null} draftID={draft.id} busy={busy} error={moments.error}
      onSchedule={async (input) => { const result = await moments.schedule(input); if (result.ok) { setScheduling(false); setNotice('Email scheduled.'); } return result.ok; }}
      onReschedule={async () => false} onClose={() => setScheduling(false)} />}
    {moving && <ScheduleSheet moment={moment} plan={moving} draftID={moving.draftID} busy={busy} error={moments.error}
      onSchedule={async () => false}
      onReschedule={async (plan, at, zone) => { const result = await moments.changePlan(plan.id, 'reschedule', { scheduledAtUTC: at, timeZoneID: zone }); if (result.ok) { setMoving(null); setNotice('Email moved.'); } return result.ok; }}
      onClose={() => setMoving(null)} />}
    {pending && <ConfirmDialog title={CONFIRM[pending.kind].title} message={moments.error ? `${CONFIRM[pending.kind].message} ${moments.error}` : CONFIRM[pending.kind].message} confirmLabel={CONFIRM[pending.kind].label}
      destructive={CONFIRM[pending.kind].destructive} busy={busy} onConfirm={() => void confirm()} onCancel={() => setPending(null)} />}
  </>;
}
