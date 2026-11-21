/**
 * Important Moments on the web: wire types, the labels and rules the phone app applies, and the pure
 * date/zone arithmetic the screens need. Mirrors mobile/src/api/moments.ts and
 * mobile/src/features/moments/domain.ts for the slice the web covers (list, add, edit, wish, automatic
 * email). Everything here is pure so it can be unit-tested without a browser.
 */

export type WishDeliveryPlan = {
  id: string;
  draftID: string;
  channel: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAtUTC: string;
  timeZoneID: string;
  status: string;
  idempotencyKey: string;
  automaticDelivery: boolean;
  repeatYearly: boolean;
  reminderOffset: number;
  sentAt?: string | null;
  lastError?: string | null;
};

export type WishDraft = {
  id: string;
  momentID: string;
  tone: string;
  body: string;
  personalContext: string;
  status: string;
  generationVersion: number;
  plans?: WishDeliveryPlan[] | null;
};

export type ImportantMoment = {
  id: string;
  type: string;
  title: string;
  firstName: string;
  phone: string;
  email: string;
  occurrenceDate: string;
  timeZoneID: string;
  source: string;
  sourceKey: string;
  yearly: boolean;
  enabled: boolean;
  festivalSettings?: string | null;
  snoozedUntil?: string | null;
  nextOccurrence: string;
  emailSubject?: string;
  drafts: WishDraft[];
};

export type MomentsSnapshot = {
  moments: ImportantMoment[];
  emailAccount: { email: string; status: string } | null;
  emailConfigured: boolean;
  automaticEmailEnabled: boolean;
};

export type MomentInput = {
  type: string;
  title: string;
  firstName: string;
  phone: string;
  email: string;
  occurrenceDate: string;
  timeZoneID: string;
  yearly: boolean;
  source: string;
  sourceKey: string;
};

export const MOMENT_TYPES = [
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'festival', label: 'Festival' },
  { value: 'getWellSoon', label: 'Get Well Soon' },
  { value: 'custom', label: 'Custom' },
] as const;

export const TONES = ['Warm', 'Personal', 'Short', 'Fun'] as const;
export type Tone = (typeof TONES)[number];

export const WISH_LIMIT = 500;
export const CONTEXT_LIMIT = 500;
export const TITLE_LIMIT = 150;
export const NAME_LIMIT = 80;
export const PHONE_LIMIT = 40;

/** Plans that ended in a delivery (or a hand-off the app cannot confirm). A draft with one needs a fresh wish. */
export const HISTORY_STATUSES = ['SENT', 'COPIED', 'SHARED'];
/** A wish with one of these cannot be edited or re-scheduled; the server answers 409. */
export const ACTIVE_STATUSES = ['SENDING', 'SCHEDULED', 'AWAITING_CONFIRMATION'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function typeLabel(type: string): string {
  if (type === 'getWellSoon') return 'Get Well Soon';
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : '';
}

/** Moments the phone app archived (festival management) carry `archived:true` in their settings JSON. */
export function isArchived(moment: Pick<ImportantMoment, 'festivalSettings'>): boolean {
  if (!moment.festivalSettings) return false;
  try {
    const parsed: unknown = JSON.parse(moment.festivalSettings);
    return typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>).archived === true;
  } catch {
    return false;
  }
}

/** The server returns drafts newest first. */
export function latestDraft(moment: Pick<ImportantMoment, 'drafts'>): WishDraft | undefined {
  return moment.drafts[0];
}

export function allPlans(moment: Pick<ImportantMoment, 'drafts'>): WishDeliveryPlan[] {
  return moment.drafts.flatMap((draft) => draft.plans ?? []);
}

export function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

export function planDate(plan: Pick<WishDeliveryPlan, 'scheduledAtUTC'>): number {
  return parseInstant(plan.scheduledAtUTC) ?? Number.NEGATIVE_INFINITY;
}

export function planEditable(plan: Pick<WishDeliveryPlan, 'status'>): boolean {
  return ['SCHEDULED', 'AWAITING_CONFIRMATION', 'FAILED'].includes(plan.status);
}

export function planStatusLabel(plan: Pick<WishDeliveryPlan, 'status'>): string {
  switch (plan.status) {
    case 'SCHEDULED': return 'Auto-send scheduled';
    case 'AWAITING_CONFIRMATION': return 'Waiting for confirmation';
    case 'SENDING': return 'Sending';
    case 'SENT': return 'Sent';
    case 'COPIED': return 'Copied — delivery not confirmed';
    case 'SHARED': return 'Shared — delivery not confirmed';
    case 'UNCERTAIN': return 'Check Sent mail';
    case 'FAILED': return 'Failed';
    case 'CANCELLED': return 'Cancelled';
    case 'EXPIRED': return 'Expired';
    default: return plan.status ? plan.status.charAt(0) + plan.status.slice(1).toLowerCase() : '';
  }
}

export function isValidZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function deviceZone(): string {
  const zone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
  return zone && isValidZone(zone) ? zone : 'UTC';
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

/** The wall-clock fields of an instant in a time zone. */
export function wallParts(at: number, zone: string): Parts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(at))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return { year: values.year, month: values.month, day: values.day, hour: values.hour % 24, minute: values.minute };
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** `yyyy-MM-dd` of an instant in a zone. */
export function momentDay(at: number, zone: string): string {
  const parts = wallParts(at, zone);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Whether `day` is a real calendar date (rejects 2026-02-30). */
export function isRealDay(day: string): boolean {
  if (!DAY.test(day)) return false;
  const [year, month, date] = day.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, date));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === date;
}

/**
 * The instant at which the wall clock in `zone` reads `day` `hour:minute`. Null for a date that does
 * not exist or a wall time the zone skips (the spring-forward gap).
 */
export function zonedInstant(day: string, hour: number, minute: number, zone: string): number | null {
  if (!isRealDay(day) || !isValidZone(zone)) return null;
  const [year, month, date] = day.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, date, hour, minute);
  // Two passes settle the offset, including across a daylight-saving change.
  let at = guess;
  for (let pass = 0; pass < 2; pass++) {
    const shown = wallParts(at, zone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    at += guess - shownAsUtc;
  }
  const check = wallParts(at, zone);
  return check.year === year && check.month === month && check.day === date && check.hour === hour && check.minute === minute ? at : null;
}

/** `yyyy-MM-dd` and `HH:mm` of an instant in a zone, for the date and time inputs. */
export function dayAndTime(at: number, zone: string): { day: string; time: string } {
  const parts = wallParts(at, zone);
  return { day: `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`, time: `${pad(parts.hour)}:${pad(parts.minute)}` };
}

export function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

const DAY_MS = 86_400_000;

/** Whole days from one `yyyy-MM-dd` to another. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** "Today", "Tomorrow", "In 12 days", "3 days ago" for a moment day seen from `now` in the moment's zone. */
export function relativeDay(day: string, zone: string, now: number = Date.now()): string {
  const delta = daysBetween(momentDay(now, zone), day);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return delta > 0 ? `In ${delta} days` : `${-delta} days ago`;
}

export function dayLabel(day: string): string {
  if (!isRealDay(day)) return day;
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, date)));
}

export function instantLabel(at: number, zone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(at));
}

/** The delivery the next occurrence is waiting on: a SCHEDULED or AWAITING_CONFIRMATION plan on that day. */
export function upcomingDelivery(moment: ImportantMoment): WishDeliveryPlan | undefined {
  return allPlans(moment)
    .filter((plan) => ['SCHEDULED', 'AWAITING_CONFIRMATION'].includes(plan.status) && momentDay(planDate(plan), moment.timeZoneID) === moment.nextOccurrence)
    .sort((a, b) => planDate(a) - planDate(b))[0];
}

/** A plan that is still in play for the moment, whatever day it is on (blocks editing the moment). */
export function activePlan(moment: ImportantMoment): WishDeliveryPlan | undefined {
  return allPlans(moment).find((plan) => ACTIVE_STATUSES.includes(plan.status));
}

/** An approved wish exists for this year's occurrence and nothing has gone out for it. */
export function readyToSchedule(moment: ImportantMoment): boolean {
  if (!moment.enabled || upcomingDelivery(moment) || moment.occurrenceDate !== moment.nextOccurrence) return false;
  const latest = latestDraft(moment);
  return latest?.status === 'READY' && !(latest.plans ?? []).some((plan) => HISTORY_STATUSES.includes(plan.status));
}

export function needsWishReview(moment: ImportantMoment): boolean {
  return moment.enabled && !upcomingDelivery(moment) && !readyToSchedule(moment);
}

export type MomentState = 'scheduled' | 'ready' | 'needs-wish' | 'sent' | 'failed' | 'off';

/** One word for the list row: where this moment stands. */
export function momentState(moment: ImportantMoment): { state: MomentState; label: string } {
  if (!moment.enabled) return { state: 'off', label: 'Reminders off' };
  const upcoming = upcomingDelivery(moment);
  if (upcoming) return { state: 'scheduled', label: planStatusLabel(upcoming) };
  const failed = allPlans(moment).find((plan) => ['FAILED', 'UNCERTAIN'].includes(plan.status) && momentDay(planDate(plan), moment.timeZoneID) === moment.nextOccurrence);
  if (failed) return { state: 'failed', label: planStatusLabel(failed) };
  if (readyToSchedule(moment)) return { state: 'ready', label: 'Wish ready to schedule' };
  const latest = latestDraft(moment);
  if ((latest?.plans ?? []).some((plan) => plan.status === 'SENT') && moment.occurrenceDate !== moment.nextOccurrence) return { state: 'sent', label: 'Sent' };
  return { state: 'needs-wish', label: 'Needs a wish' };
}

export type MomentsTab = 'Upcoming' | 'Scheduled' | 'Sent';

export function sortedPlans(moments: ImportantMoment[]): WishDeliveryPlan[] {
  return moments.flatMap(allPlans).sort((a, b) => planDate(a) - planDate(b));
}

/** Moments for a tab, soonest first. Archived moments only appear under Sent. */
export function displayedMoments(moments: ImportantMoment[], { tab, filter, search }: { tab: MomentsTab; filter: string; search: string }, now: number = Date.now()): ImportantMoment[] {
  const needle = search.trim().toLowerCase();
  return moments
    .filter((moment) => {
      if (tab !== 'Sent' && isArchived(moment)) return false;
      if (filter !== 'All' && moment.type !== filter) return false;
      if (needle && !`${moment.title} ${moment.firstName}`.toLowerCase().includes(needle)) return false;
      const plans = allPlans(moment);
      if (tab === 'Upcoming') return moment.nextOccurrence >= momentDay(now, moment.timeZoneID);
      if (tab === 'Scheduled') return plans.some((plan) => ['SCHEDULED', 'AWAITING_CONFIRMATION', 'SENDING', 'FAILED', 'UNCERTAIN'].includes(plan.status));
      return plans.some((plan) => HISTORY_STATUSES.includes(plan.status));
    })
    .sort((a, b) => (a.nextOccurrence < b.nextOccurrence ? -1 : a.nextOccurrence > b.nextOccurrence ? 1 : 0));
}

export function newMomentInput(sourceKey: string, zone: string = deviceZone()): MomentInput {
  return { type: 'birthday', title: '', firstName: '', phone: '', email: '', occurrenceDate: '', timeZoneID: zone, yearly: true, source: 'manual', sourceKey };
}

/** The form's starting values for an existing moment. */
export function inputFromMoment(moment: ImportantMoment): MomentInput {
  return {
    type: moment.type, title: moment.title, firstName: moment.firstName, phone: moment.phone, email: moment.email,
    occurrenceDate: moment.occurrenceDate, timeZoneID: moment.timeZoneID, yearly: moment.yearly, source: moment.source, sourceKey: moment.sourceKey,
  };
}

/** Trimmed copy of the form, ready to send. */
export function cleanedInput(input: MomentInput): MomentInput {
  return { ...input, title: input.title.trim(), firstName: input.firstName.trim(), phone: input.phone.trim(), email: input.email.trim() };
}

/** What stops the form from being saved, in the words the screen shows; null when it can be saved. */
export function momentIssue(input: MomentInput): string | null {
  const value = cleanedInput(input);
  if (!value.title) return 'Give the moment a title.';
  if (value.title.length > TITLE_LIMIT) return `The title can be at most ${TITLE_LIMIT} characters.`;
  if (value.firstName.length > NAME_LIMIT) return `The first name can be at most ${NAME_LIMIT} characters.`;
  if (value.phone.length > PHONE_LIMIT) return `The phone number can be at most ${PHONE_LIMIT} characters.`;
  if (value.email && !EMAIL.test(value.email)) return 'Enter a valid email address, or leave it empty.';
  if (!isRealDay(value.occurrenceDate)) return 'Pick the date of the moment.';
  if (!isValidZone(value.timeZoneID)) return 'That time zone is not recognised.';
  return null;
}

export function wishIssue(body: string): string | null {
  const text = body.trim();
  if (!text) return 'Write the wish before approving it.';
  if (text.length > WISH_LIMIT) return `A wish can be at most ${WISH_LIMIT} characters (it is ${text.length}).`;
  return null;
}

export type ScheduleForm = { recipient: string; day: string; time: string; zone: string; repeatYearly: boolean; reminderOffset: 0 | 60 };

/** Where scheduling starts: the occurrence day at 9:00 in the moment's zone, or the next 9:00 if that has passed. */
export function defaultScheduleForm(moment: ImportantMoment, now: number = Date.now()): ScheduleForm {
  const zone = moment.timeZoneID;
  let day = moment.nextOccurrence;
  const nine = zonedInstant(day, 9, 0, zone);
  if (nine !== null && nine <= now) {
    const today = momentDay(now, zone);
    day = day < today ? today : day;
  }
  let time = '09:00';
  const at = zonedInstant(day, 9, 0, zone);
  if (at === null || at <= now) time = dayAndTime(now + 3_600_000, zone).time;
  return { recipient: moment.email, day, time, zone, repeatYearly: moment.yearly, reminderOffset: 0 };
}

/** The instant a schedule form means, or null when its day, time or zone is not valid. */
export function scheduleInstant(form: Pick<ScheduleForm, 'day' | 'time' | 'zone'>): number | null {
  const time = parseTime(form.time);
  return time ? zonedInstant(form.day, time.hour, time.minute, form.zone) : null;
}

export function scheduleIssue(form: ScheduleForm, now: number = Date.now()): string | null {
  if (!EMAIL.test(form.recipient.trim())) return 'Enter the email address the wish goes to.';
  const at = scheduleInstant(form);
  if (at === null) return 'Pick a valid date and time.';
  if (at <= now) return 'Pick a time in the future.';
  return null;
}

/** The `schedule` operation's input for an automatic email. `idempotencyKey` is fixed per attempt so a retry cannot double-send. */
export function scheduleInput(draftID: string, form: ScheduleForm, idempotencyKey: string): Record<string, unknown> {
  const at = scheduleInstant(form);
  return {
    draftID,
    channel: 'email',
    recipient: form.recipient.trim(),
    scheduledAtUTC: at === null ? '' : new Date(at).toISOString(),
    timeZoneID: form.zone,
    automaticDelivery: true,
    reminderOffset: form.reminderOffset,
    repeatYearly: form.repeatYearly,
    idempotencyKey,
    sendNow: false,
    approved: true,
  };
}

/** Why the screen cannot offer to schedule an email yet; null when it can. */
export function emailBlocker(snapshot: Pick<MomentsSnapshot, 'emailAccount' | 'emailConfigured' | 'automaticEmailEnabled'>): string | null {
  if (!snapshot.emailConfigured) return 'Email sending is not set up on this server.';
  if (!snapshot.automaticEmailEnabled) return 'Automatic email is switched off for this workspace right now.';
  if (!snapshot.emailAccount || snapshot.emailAccount.status !== 'connected') return 'Connect Gmail in the Nexdo mobile app first (Important Moments → Email), then come back here.';
  return null;
}
