'use client';

import { useMemo, useRef, useState } from 'react';
import {
  MOMENT_TYPES, TITLE_LIMIT, NAME_LIMIT, PHONE_LIMIT, cleanedInput, dayAndTime, defaultScheduleForm, deviceZone, inputFromMoment, momentIssue, newMomentInput,
  planDate, scheduleInput, scheduleInstant, scheduleIssue, type ImportantMoment, type MomentInput, type ScheduleForm, type WishDeliveryPlan,
} from '@/lib/moments';
import { Sheet } from './shopping-sheets';
import './tasks-screen.css';
import './moments.css';

/** Every IANA zone the browser knows, with the one in use first so it is always selectable. */
function useZones(current: string): string[] {
  return useMemo(() => {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    return [current, ...list.filter((zone) => zone !== current)];
  }, [current]);
}

/** Add a moment, or edit the one given. The server refuses an edit while a wish for it is queued or sending. */
export function MomentFormSheet({ moment, busy, error, onSave, onClose }: {
  moment: ImportantMoment | null;
  busy: boolean;
  error: string | null;
  onSave: (input: MomentInput, id?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [input, setInput] = useState<MomentInput>(() => (moment ? inputFromMoment(moment) : newMomentInput(`manual:${crypto.randomUUID()}`, deviceZone())));
  const [touched, setTouched] = useState(false);
  const zones = useZones(input.timeZoneID);
  const issue = momentIssue(input);
  const set = <K extends keyof MomentInput>(key: K, value: MomentInput[K]) => setInput((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (issue || busy) return;
    await onSave(cleanedInput(input), moment?.id);
  }

  return <Sheet title={moment ? 'Edit Moment' : 'Add Moment'} onClose={onClose} busy={busy} onSubmit={submit}
    footer={<button type="submit" className="nx-primary" disabled={busy}>{busy ? 'Saving…' : moment ? 'Save Changes' : 'Add Moment'}</button>}>
    <div className="nx-form-card">
      <div>
        <label className="nx-label" htmlFor="mo-type">OCCASION</label>
        <select id="mo-type" className="nx-field" value={input.type} disabled={busy} onChange={(event) => set('type', event.target.value)}>
          {MOMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </div>
      <hr />
      <div>
        <label className="nx-label" htmlFor="mo-title">TITLE</label>
        <input id="mo-title" className="nx-field" required maxLength={TITLE_LIMIT} autoComplete="off" placeholder="Mom’s birthday" value={input.title} disabled={busy} onChange={(event) => set('title', event.target.value)} />
      </div>
      <hr />
      <div>
        <label className="nx-label" htmlFor="mo-date">DATE</label>
        <input id="mo-date" type="date" className="nx-field" required value={input.occurrenceDate} disabled={busy} onChange={(event) => set('occurrenceDate', event.target.value)} />
      </div>
      <hr />
      <label className="nx-form-row"><span>Repeat every year</span><input type="checkbox" checked={input.yearly} disabled={busy} onChange={(event) => set('yearly', event.target.checked)} /></label>
      <hr />
      <div>
        <label className="nx-label" htmlFor="mo-zone">TIME ZONE</label>
        <select id="mo-zone" className="nx-field" value={input.timeZoneID} disabled={busy} onChange={(event) => set('timeZoneID', event.target.value)}>
          {zones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
        </select>
      </div>
    </div>
    <h3 className="mo-section">WHO IS IT FOR</h3>
    <div className="nx-form-card">
      <div>
        <label className="nx-label" htmlFor="mo-first">FIRST NAME</label>
        <input id="mo-first" className="nx-field" maxLength={NAME_LIMIT} autoComplete="off" value={input.firstName} disabled={busy} onChange={(event) => set('firstName', event.target.value)} />
      </div>
      <hr />
      <div>
        <label className="nx-label" htmlFor="mo-email">EMAIL</label>
        <input id="mo-email" type="email" className="nx-field" autoComplete="off" placeholder="Needed to send the wish by email" value={input.email} disabled={busy} onChange={(event) => set('email', event.target.value)} />
      </div>
      <hr />
      <div>
        <label className="nx-label" htmlFor="mo-phone">PHONE (OPTIONAL)</label>
        <input id="mo-phone" type="tel" className="nx-field" maxLength={PHONE_LIMIT} autoComplete="off" value={input.phone} disabled={busy} onChange={(event) => set('phone', event.target.value)} />
      </div>
    </div>
    {touched && issue && <p role="alert" className="nx-sheet-error">{issue}</p>}
    {error && <p role="alert" className="nx-sheet-error">{error}</p>}
  </Sheet>;
}

/**
 * Schedule an automatic email, or move one that is already scheduled. The idempotency key stays the same
 * for every attempt of one schedule, so a double click or a retry after a lost answer cannot send twice.
 */
export function ScheduleSheet({ moment, plan, draftID, busy, error, onSchedule, onReschedule, onClose }: {
  moment: ImportantMoment;
  plan: WishDeliveryPlan | null;
  draftID: string;
  busy: boolean;
  error: string | null;
  onSchedule: (input: Record<string, unknown>) => Promise<boolean>;
  onReschedule: (plan: WishDeliveryPlan, scheduledAtUTC: string, timeZoneID: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ScheduleForm>(() => {
    if (!plan) return defaultScheduleForm(moment);
    const zone = plan.timeZoneID || moment.timeZoneID;
    const { day, time } = dayAndTime(planDate(plan), zone);
    return { recipient: plan.recipient, day, time, zone, repeatYearly: plan.repeatYearly, reminderOffset: plan.reminderOffset === 60 ? 60 : 0 };
  });
  const [touched, setTouched] = useState(false);
  const key = useRef('');
  const zones = useZones(form.zone);
  const issue = scheduleIssue(form);
  const set = <K extends keyof ScheduleForm>(name: K, value: ScheduleForm[K]) => setForm((current) => ({ ...current, [name]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (issue || busy) return;
    if (plan) {
      const at = scheduleInstant(form);
      if (at !== null) await onReschedule(plan, new Date(at).toISOString(), form.zone);
      return;
    }
    key.current ||= crypto.randomUUID();
    const done = await onSchedule(scheduleInput(draftID, form, key.current));
    if (done) key.current = '';
  }

  return <Sheet title={plan ? 'Reschedule' : 'Schedule Email'} onClose={onClose} busy={busy} onSubmit={submit}
    footer={<button type="submit" className="nx-primary" disabled={busy}>{busy ? 'Saving…' : plan ? 'Move to this time' : 'Schedule automatic email'}</button>}>
    <div className="nx-form-card">
      <div>
        <label className="nx-label" htmlFor="mo-to">SEND TO</label>
        <input id="mo-to" type="email" className="nx-field" required autoComplete="off" value={form.recipient} disabled={busy || plan !== null} onChange={(event) => set('recipient', event.target.value)} />
      </div>
      <hr />
      <div className="sp-two">
        <div>
          <label className="nx-label" htmlFor="mo-day">DAY</label>
          <input id="mo-day" type="date" className="nx-field" required value={form.day} disabled={busy} onChange={(event) => set('day', event.target.value)} />
        </div>
        <div>
          <label className="nx-label" htmlFor="mo-time">TIME</label>
          <input id="mo-time" type="time" className="nx-field" required value={form.time} disabled={busy} onChange={(event) => set('time', event.target.value)} />
        </div>
      </div>
      <hr />
      <div>
        <label className="nx-label" htmlFor="mo-send-zone">TIME ZONE</label>
        <select id="mo-send-zone" className="nx-field" value={form.zone} disabled={busy} onChange={(event) => set('zone', event.target.value)}>
          {zones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
        </select>
      </div>
      {!plan && <>
        <hr />
        <label className="nx-form-row"><span>Send again every year</span><input type="checkbox" checked={form.repeatYearly} disabled={busy} onChange={(event) => set('repeatYearly', event.target.checked)} /></label>
        <hr />
        <label className="nx-form-row"><span>Remind me an hour before</span><input type="checkbox" checked={form.reminderOffset === 60} disabled={busy} onChange={(event) => set('reminderOffset', event.target.checked ? 60 : 0)} /></label>
      </>}
    </div>
    <p className="nx-hint">Nexdo sends this wish from your connected Gmail at the time above. You can cancel or move it until it is sent.</p>
    {touched && issue && <p role="alert" className="nx-sheet-error">{issue}</p>}
    {error && <p role="alert" className="nx-sheet-error">{error}</p>}
  </Sheet>;
}
