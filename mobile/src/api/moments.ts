import { getApi, type ApiClient } from './index';

/**
 * Important Moments wire types and the one endpoint they use, `/api/moments`.
 *
 * Shapes are the server's (src/server/moments/{domain,service,festival,greeting-card,email}.ts and
 * src/app/api/moments/route.ts), read against the Swift decoders in
 * ios/Sources/NexdoCore/ImportantMoment.swift:3-43 and ios/App/ImportantMomentsStore.swift:5-12.
 * Prisma `DateTime` columns arrive as ISO-8601 strings with milliseconds.
 */

/** `WishDeliveryPlan` (ImportantMoment.swift:27-43); Prisma `DeliveryPlan`. */
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

/** `WishDraft` (ImportantMoment.swift:22-26). */
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

/** `ImportantMoment` (ImportantMoment.swift:3-9), with the server's computed `nextOccurrence`. */
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
  drafts: WishDraft[];
};

/** `MomentsSnapshot` (ImportantMomentsStore.swift:5-10); `listMoments` in service.ts. */
export type MomentsSnapshot = {
  moments: ImportantMoment[];
  emailAccount: { email: string; status: string } | null;
  emailConfigured: boolean;
  automaticEmailEnabled: boolean;
};

/** `MomentInput` (ImportantMoment.swift:75-80); `momentInput` in domain.ts. */
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

/** `WishScheduleInput` (ImportantMomentsView.swift:437-445). */
export type WishScheduleInput = {
  draftID: string;
  channel: string;
  recipient: string;
  scheduledAtUTC: string;
  timeZoneID: string;
  automaticDelivery: boolean;
  reminderOffset: number;
  repeatYearly: boolean;
  idempotencyKey: string;
  sendNow: boolean;
  approved: true;
};

/** `FestivalCatalogEntry` (FestivalManagement.swift:88-93); `catalogEntry` in festival.ts. */
export type FestivalCatalogEntry = { id: string; name: string; dates: string[]; sourceURL: string };

export type MomentOperation =
  | 'save'
  | 'generate'
  | 'approve'
  | 'schedule'
  | 'plan'
  | 'connectEmail'
  | 'disconnectEmail'
  | 'visibility'
  | 'festivalSave'
  | 'festivalDelete'
  | 'festivalCatalog'
  | 'greetingArtwork'
  | 'greetingCardSave';

/**
 * The `action` accepted by the `plan` operation (service.ts `changePlan`).
 *
 * `opened` applies only to a manual Messages plan that is AWAITING_CONFIRMATION: it holds that
 * status, records "Messages opened; delivery not confirmed." and never sets `sentAt`.
 */
export type PlanAction =
  | 'cancel'
  | 'sent'
  | 'failed'
  | 'copied'
  | 'shared'
  | 'reschedule'
  | 'retry'
  | 'sendNow'
  | 'opened';

/** Response bodies, per operation (route.ts:219-241). */
export type MomentOK = { ok: true };
export type SaveMomentResponse = { moment: ImportantMoment };
export type GenerateResponse = { draft: WishDraft; usedAI: boolean };
export type DraftResponse = { draft: WishDraft };
export type PlanResponse = { plan: WishDeliveryPlan };
export type ConnectEmailResponse = { url: string };
export type CatalogResponse = { entries: FestivalCatalogEntry[] };
export type ArtworkResponse = { data: string; mime: string };

/** `MomentEnvelope` (ImportantMomentsStore.swift:11): `{ operation, input?, id? }`. */
export type MomentEnvelope = { operation: MomentOperation; input?: unknown; id?: string };

/**
 * The timeouts `ImportantMomentsStore` passes: 20s for the snapshot (`:78`), 150s for artwork and
 * 50s for every other operation (`:93`).
 */
export function operationTimeout(operation: MomentOperation): number {
  return operation === 'greetingArtwork' ? 150_000 : 50_000;
}

export const momentsApi = {
  snapshot: (client: ApiClient = getApi()) => client.get<MomentsSnapshot>('/api/moments', { timeoutMs: 20_000 }),

  post: <R>(operation: MomentOperation, input: unknown, id?: string, client: ApiClient = getApi()) => {
    const envelope: MomentEnvelope = { operation, ...(input === undefined ? {} : { input }), ...(id === undefined ? {} : { id }) };
    return client.post<R>('/api/moments', envelope, { timeoutMs: operationTimeout(operation) });
  },

  /** `deleteData()` (ImportantMomentsStore.swift:121): every moment, draft, plan and the email account. */
  deleteAll: (client: ApiClient = getApi()) => client.del<MomentOK>('/api/moments'),
};
