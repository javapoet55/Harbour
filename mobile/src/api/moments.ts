import { getApi, type ApiClient } from './index';

/**
 * Important Moments wire types — the MINIMUM the Today screen reads (Phase 11 Run A).
 *
 * Ported from `ImportantMoment`, `WishDraft` and `WishDeliveryPlan`
 * (ios/Sources/NexdoCore/ImportantMoment.swift:3-43) and `MomentsSnapshot`
 * (ios/App/ImportantMomentsStore.swift:5-10). Verified against the server: `GET /api/moments` returns
 * `listMoments` (src/server/moments/service.ts:9-13) — every `ImportantMoment` column plus a computed
 * `nextOccurrence` (`yyyy-MM-dd`), with `drafts` newest first and each draft's `plans`.
 *
 * Runs B and C extend this file with the POST operations; keep additions here additive.
 */

export type WishDeliveryPlan = {
  id: string;
  draftID: string;
  channel: string;
  recipient: string;
  subject: string;
  body: string;
  /** ISO 8601 instant. */
  scheduledAtUTC: string;
  timeZoneID: string;
  /** `SCHEDULED`, `AWAITING_CONFIRMATION`, `SENT`, `COPIED`, `SHARED`, `UNCERTAIN`, `FAILED`, `CANCELLED`… */
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
  /** `birthday`, `anniversary`, `festival`, `getWellSoon`, `custom`. */
  type: string;
  title: string;
  firstName: string;
  phone: string;
  email: string;
  /** `yyyy-MM-dd`. */
  occurrenceDate: string;
  timeZoneID: string;
  source: string;
  sourceKey: string;
  yearly: boolean;
  enabled: boolean;
  /** A JSON string (`FestivalSettings`); `"{}"` when unset. */
  festivalSettings?: string | null;
  /** ISO 8601 instant, or null. */
  snoozedUntil?: string | null;
  /** `yyyy-MM-dd`, computed by the server. */
  nextOccurrence: string;
  drafts: WishDraft[];
};

export type MomentsSnapshot = {
  moments: ImportantMoment[];
  emailAccount: { email: string; status: string } | null;
  emailConfigured: boolean;
  automaticEmailEnabled: boolean;
};

export const momentsEndpoints = {
  /** `ImportantMomentsStore.refresh()` (ImportantMomentsStore.swift:73-83): a 20s timeout. */
  list: (client: ApiClient = getApi()) => client.get<MomentsSnapshot>('/api/moments', { timeoutMs: 20_000 }),
};
