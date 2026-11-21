import { describe, expect, it } from 'vitest';
import {
  cleanedInput, defaultScheduleForm, displayedMoments, emailBlocker, isArchived, isRealDay, momentDay, momentIssue, momentState, newMomentInput,
  planEditable, planStatusLabel, readyToSchedule, relativeDay, scheduleInput, scheduleIssue, typeLabel, upcomingDelivery, wishIssue, zonedInstant,
  type ImportantMoment, type WishDeliveryPlan,
} from './moments';

const plan = (over: Partial<WishDeliveryPlan> = {}): WishDeliveryPlan => ({
  id: 'p1', draftID: 'd1', channel: 'email', recipient: 'a@b.co', subject: 's', body: 'b', scheduledAtUTC: '2026-12-01T14:00:00.000Z',
  timeZoneID: 'America/New_York', status: 'SCHEDULED', idempotencyKey: 'k', automaticDelivery: true, repeatYearly: true, reminderOffset: 0, ...over,
});

const moment = (over: Partial<ImportantMoment> = {}): ImportantMoment => ({
  id: 'm1', type: 'birthday', title: 'Mom', firstName: 'Mom', phone: '', email: 'mom@x.co', occurrenceDate: '2026-12-01', timeZoneID: 'America/New_York',
  source: 'manual', sourceKey: 'manual:1', yearly: true, enabled: true, nextOccurrence: '2026-12-01', drafts: [], ...over,
});

const withDraft = (status: string, plans: WishDeliveryPlan[] = [], over: Partial<ImportantMoment> = {}) =>
  moment({ drafts: [{ id: 'd1', momentID: 'm1', tone: 'Warm', body: 'Happy birthday', personalContext: '', status, generationVersion: 1, plans }], ...over });

describe('labels', () => {
  it('names the types', () => {
    expect(typeLabel('getWellSoon')).toBe('Get Well Soon');
    expect(typeLabel('birthday')).toBe('Birthday');
  });
  it('reads the archived flag and survives bad JSON', () => {
    expect(isArchived({ festivalSettings: '{"archived":true}' })).toBe(true);
    expect(isArchived({ festivalSettings: '{}' })).toBe(false);
    expect(isArchived({ festivalSettings: 'not json' })).toBe(false);
    expect(isArchived({ festivalSettings: null })).toBe(false);
  });
  it('labels plan statuses', () => {
    expect(planStatusLabel({ status: 'SCHEDULED' })).toBe('Auto-send scheduled');
    expect(planStatusLabel({ status: 'UNCERTAIN' })).toBe('Check Sent mail');
    expect(planStatusLabel({ status: 'CANCELLED' })).toBe('Cancelled');
    expect(planEditable({ status: 'FAILED' })).toBe(true);
    expect(planEditable({ status: 'SENT' })).toBe(false);
  });
});

describe('dates and zones', () => {
  it('finds the day in a zone', () => {
    const at = Date.parse('2026-12-01T03:30:00Z');
    expect(momentDay(at, 'America/New_York')).toBe('2026-11-30');
    expect(momentDay(at, 'Asia/Kolkata')).toBe('2026-12-01');
  });
  it('rejects impossible days', () => {
    expect(isRealDay('2026-02-30')).toBe(false);
    expect(isRealDay('2028-02-29')).toBe(true);
    expect(isRealDay('2026-2-3')).toBe(false);
  });
  it('builds the instant for a wall time, either side of a DST change', () => {
    expect(new Date(zonedInstant('2026-12-01', 9, 0, 'America/New_York')!).toISOString()).toBe('2026-12-01T14:00:00.000Z');
    expect(new Date(zonedInstant('2026-07-01', 9, 0, 'America/New_York')!).toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(new Date(zonedInstant('2026-12-01', 9, 0, 'Asia/Kolkata')!).toISOString()).toBe('2026-12-01T03:30:00.000Z');
  });
  it('refuses a wall time the zone skips', () => {
    expect(zonedInstant('2026-03-08', 2, 30, 'America/New_York')).toBeNull();
    expect(zonedInstant('2026-03-08', 3, 30, 'America/New_York')).not.toBeNull();
  });
  it('says how far away a day is', () => {
    const now = Date.parse('2026-12-01T15:00:00Z');
    expect(relativeDay('2026-12-01', 'America/New_York', now)).toBe('Today');
    expect(relativeDay('2026-12-02', 'America/New_York', now)).toBe('Tomorrow');
    expect(relativeDay('2026-12-10', 'America/New_York', now)).toBe('In 9 days');
    expect(relativeDay('2026-11-28', 'America/New_York', now)).toBe('3 days ago');
  });
});

describe('where a moment stands', () => {
  it('needs a wish when there is no draft', () => {
    expect(momentState(moment())).toEqual({ state: 'needs-wish', label: 'Needs a wish' });
    expect(readyToSchedule(moment())).toBe(false);
  });
  it('is ready once a draft is approved', () => {
    expect(readyToSchedule(withDraft('READY'))).toBe(true);
    expect(momentState(withDraft('READY')).state).toBe('ready');
    expect(readyToSchedule(withDraft('DRAFT'))).toBe(false);
  });
  it('is not ready when this year already went out, or reminders are off', () => {
    expect(readyToSchedule(withDraft('READY', [plan({ status: 'SENT' })]))).toBe(false);
    expect(readyToSchedule(withDraft('READY', [], { enabled: false }))).toBe(false);
    expect(momentState(withDraft('READY', [], { enabled: false })).state).toBe('off');
  });
  it('is not ready for a later year than the saved date', () => {
    expect(readyToSchedule(withDraft('READY', [], { nextOccurrence: '2027-12-01' }))).toBe(false);
  });
  it('is scheduled when a plan lands on the next occurrence', () => {
    const m = withDraft('READY', [plan()]);
    expect(upcomingDelivery(m)?.id).toBe('p1');
    expect(momentState(m)).toEqual({ state: 'scheduled', label: 'Auto-send scheduled' });
  });
  it('flags a failed plan', () => {
    expect(momentState(withDraft('READY', [plan({ status: 'FAILED' })])).state).toBe('failed');
  });
});

describe('tabs', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const list = [
    moment({ id: 'a', title: 'Zed', nextOccurrence: '2027-01-05' }),
    moment({ id: 'b', title: 'Amy', nextOccurrence: '2026-12-01', type: 'anniversary' }),
    moment({ id: 'c', title: 'Old', nextOccurrence: '2026-10-01' }),
    withDraft('READY', [plan({ status: 'SENT' })], { id: 'd', title: 'Sent one', nextOccurrence: '2027-03-01' }),
    withDraft('READY', [plan()], { id: 'e', title: 'Archived', festivalSettings: '{"archived":true}' }),
  ];
  const ids = (tab: 'Upcoming' | 'Scheduled' | 'Sent', filter = 'All', search = '') => displayedMoments(list, { tab, filter, search }, now).map((m) => m.id);
  it('lists upcoming soonest first and hides past and archived', () => {
    expect(ids('Upcoming')).toEqual(['b', 'a', 'd']);
  });
  it('filters by type and search', () => {
    expect(ids('Upcoming', 'anniversary')).toEqual(['b']);
    expect(ids('Upcoming', 'All', 'zed')).toEqual(['a']);
  });
  it('lists scheduled and sent', () => {
    expect(ids('Scheduled')).toEqual([]);
    expect(ids('Sent')).toEqual(['d']);
  });
});

describe('the add and edit form', () => {
  const ok = { ...newMomentInput('manual:1', 'America/New_York'), title: 'Mom', occurrenceDate: '2026-12-01' };
  it('accepts a complete form', () => expect(momentIssue(ok)).toBeNull());
  it('wants a title and a real date', () => {
    expect(momentIssue({ ...ok, title: '  ' })).toMatch(/title/);
    expect(momentIssue({ ...ok, occurrenceDate: '' })).toMatch(/date/);
    expect(momentIssue({ ...ok, occurrenceDate: '2026-02-30' })).toMatch(/date/);
  });
  it('checks the email and the limits', () => {
    expect(momentIssue({ ...ok, email: 'nope' })).toMatch(/email/);
    expect(momentIssue({ ...ok, email: 'a@b.co' })).toBeNull();
    expect(momentIssue({ ...ok, title: 'x'.repeat(151) })).toMatch(/150/);
    expect(momentIssue({ ...ok, timeZoneID: 'Mars/Base' })).toMatch(/time zone/);
  });
  it('trims before sending', () => {
    expect(cleanedInput({ ...ok, title: ' Mom ', email: ' a@b.co ' })).toMatchObject({ title: 'Mom', email: 'a@b.co' });
  });
  it('keeps a wish within 500 characters', () => {
    expect(wishIssue('')).toMatch(/Write/);
    expect(wishIssue('x'.repeat(501))).toMatch(/500/);
    expect(wishIssue('Happy birthday!')).toBeNull();
  });
});

describe('scheduling an email', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  it('starts at 9:00 on the occurrence day', () => {
    const form = defaultScheduleForm(moment(), now);
    expect(form).toMatchObject({ recipient: 'mom@x.co', day: '2026-12-01', time: '09:00', zone: 'America/New_York', repeatYearly: true, reminderOffset: 0 });
    expect(scheduleIssue(form, now)).toBeNull();
  });
  it('moves forward when 9:00 has already passed', () => {
    const late = Date.parse('2026-12-01T20:00:00Z');
    const form = defaultScheduleForm(moment(), late);
    expect(scheduleIssue(form, late)).toBeNull();
  });
  it('refuses a past time, a bad address and a skipped wall time', () => {
    const base = defaultScheduleForm(moment(), now);
    expect(scheduleIssue({ ...base, day: '2026-11-01' }, now)).toMatch(/future/);
    expect(scheduleIssue({ ...base, recipient: 'x' }, now)).toMatch(/email/);
    expect(scheduleIssue({ ...base, day: '2027-03-14', time: '02:30' }, now)).toMatch(/valid/);
  });
  it('builds an automatic email input', () => {
    const form = defaultScheduleForm(moment(), now);
    expect(scheduleInput('d1', form, 'key-1')).toEqual({
      draftID: 'd1', channel: 'email', recipient: 'mom@x.co', scheduledAtUTC: '2026-12-01T14:00:00.000Z', timeZoneID: 'America/New_York',
      automaticDelivery: true, reminderOffset: 0, repeatYearly: true, idempotencyKey: 'key-1', sendNow: false, approved: true,
    });
  });
  it('explains why email cannot be scheduled', () => {
    const base = { emailAccount: { email: 'me@g.co', status: 'connected' }, emailConfigured: true, automaticEmailEnabled: true };
    expect(emailBlocker(base)).toBeNull();
    expect(emailBlocker({ ...base, emailConfigured: false })).toMatch(/not set up/);
    expect(emailBlocker({ ...base, automaticEmailEnabled: false })).toMatch(/switched off/);
    expect(emailBlocker({ ...base, emailAccount: null })).toMatch(/mobile app/);
    expect(emailBlocker({ ...base, emailAccount: { email: 'me@g.co', status: 'expired' } })).toMatch(/mobile app/);
  });
});
