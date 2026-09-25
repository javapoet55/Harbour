import type { ImportantMoment, WishDeliveryPlan, WishDraft } from '../../api/moments';
import { newFestivalSettings, type FestivalSettings } from './domain';

export function moment(overrides: Partial<ImportantMoment> = {}): ImportantMoment {
  const day = overrides.occurrenceDate ?? '2030-09-20';
  return {
    id: 'm',
    type: 'birthday',
    title: 'Birthday',
    firstName: '',
    phone: '',
    email: '',
    occurrenceDate: day,
    nextOccurrence: day,
    timeZoneID: 'UTC',
    source: 'manual',
    sourceKey: 'test',
    yearly: false,
    enabled: true,
    drafts: [],
    festivalSettings: '{}',
    snoozedUntil: null,
    ...overrides,
  };
}

export function plan(overrides: Partial<WishDeliveryPlan> = {}): WishDeliveryPlan {
  return {
    id: 'p',
    draftID: 'd',
    channel: 'messages',
    recipient: '+15555550123',
    subject: 'Birthday',
    body: 'Hi',
    scheduledAtUTC: '2030-09-20T08:00:00.000Z',
    timeZoneID: 'UTC',
    status: 'AWAITING_CONFIRMATION',
    idempotencyKey: 'k',
    automaticDelivery: false,
    repeatYearly: false,
    reminderOffset: 0,
    sentAt: null,
    lastError: null,
    ...overrides,
  };
}

export function draft(overrides: Partial<WishDraft> = {}): WishDraft {
  return { id: 'd', momentID: 'm', tone: 'Warm', body: 'Hi', personalContext: '', status: 'READY', generationVersion: 1, plans: [], ...overrides };
}

export function settings(overrides: Partial<FestivalSettings> = {}): string {
  return JSON.stringify({ ...newFestivalSettings('shared'), ...overrides });
}
