/**
 * Follow-up preparation (6f079c0): `FollowUpPreparation` and `FollowUpEnvelope`
 * (ios/Sources/NexdoCore/FollowUpPreparation.swift), checked against the server's
 * `preparationSchema` (src/server/follow-up.ts:4-10).
 *
 * One preparation per task, stored on the account and shared by the task, Today and the action's
 * notification (ios/App/FollowUpPreparationView.swift:3). The screen waits for captures; this is the
 * model it will sit on.
 */

export type FollowUpResult = 'resolved' | 'unresolved' | 'noAnswer';

/** `Check` (FollowUpPreparation.swift:4-9). Server: id ≤ 100, title ≤ 500, at most 30 of them. */
export type FollowUpCheck = { id: string; title: string; done: boolean };

/**
 * `Outcome` (:10-17). `date` is ISO 8601 in UTC — the server's `z.string().datetime()` refuses an
 * offset other than `Z`. Notes ≤ 2000, at most 100 outcomes.
 */
export type FollowUpOutcome = { id: string; date: string; result: FollowUpResult; notes: string };

/**
 * Every field is required on the wire (`preparationSchema` has no `.optional()`), so a preparation is
 * always sent whole. `company` and `purpose` are trimmed by the server and must not be empty after it.
 */
export type FollowUpPreparation = {
  company: string;
  purpose: string;
  phone: string;
  email: string;
  notes: string;
  draft: string;
  checklist: FollowUpCheck[];
  outcomes: FollowUpOutcome[];
};

/**
 * `FollowUpEnvelope` (:33-37) — the GET and PUT body and answer. `preparation` is null until the first
 * save (`{ revision: 0, preparation: null }`, follow-up.ts:18).
 */
export type FollowUpEnvelope = { revision: number; preparation: FollowUpPreparation | null };

/** The server's limits (follow-up.ts:5-8), so a screen can stop before a 400. */
export const FOLLOW_UP_LIMITS = { company: 200, purpose: 2000, phone: 100, email: 320, notes: 10_000, draft: 10_000, checkTitle: 500, checklist: 30, outcomeNotes: 2000, outcomes: 100 } as const;

/** The four default steps (:30). */
export const DEFAULT_CHECKLIST = [
  'Confirm the purpose and desired result',
  'Have relevant reference numbers and documents ready',
  'Review previous notes and questions',
  'Record the response and next steps',
] as const;

/** The draft `init` writes, and that "Create draft from purpose" rebuilds (:29, FollowUpPreparationView.swift:60-62). */
export function followUpDraft(purpose: string): string {
  return 'Hello,\n\nI’m following up' + (purpose === '' ? '.' : ` regarding ${purpose}.`) + ' Could you please share an update and the next steps?\n\nThank you.';
}

/** `FollowUpPreparation.init(company:purpose:notes:)` (:27-31). `newId` is the app's `randomUUID`. */
export function makePreparation({ company, purpose, notes }: { company: string; purpose: string; notes: string }, newId: () => string): FollowUpPreparation {
  return {
    company,
    purpose,
    phone: '',
    email: '',
    notes,
    draft: followUpDraft(purpose),
    checklist: DEFAULT_CHECKLIST.map((title) => ({ id: newId(), title, done: false })),
    outcomes: [],
  };
}

/**
 * `ISO8601DateFormatter().string(from:)`: UTC, whole seconds, `Z`. `toISOString` would add
 * milliseconds; the server accepts both, but the stored strings then differ from iOS's.
 */
export function outcomeDate(now: number): string {
  return new Date(Math.floor(now / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

/** `Outcome.init(result:notes:now:)` (:14-16). */
export function makeOutcome(result: FollowUpResult, notes: string, now: number, newId: () => string): FollowUpOutcome {
  return { id: newId(), date: outcomeDate(now), result, notes };
}

/**
 * Appends the outcome ONCE. `save(then:)` (FollowUpPreparationView.swift:113-117) remembers the id it
 * recorded, so a retry after a failed save sends the same outcome instead of a second copy. Returns
 * the preparation to send and the id to remember.
 */
export function recordOutcome(
  preparation: FollowUpPreparation,
  recordedId: string | null,
  outcome: { result: FollowUpResult; notes: string },
  now: number,
  newId: () => string,
): { preparation: FollowUpPreparation; recordedId: string } {
  if (recordedId !== null) return { preparation, recordedId };
  const item = makeOutcome(outcome.result, outcome.notes, now, newId);
  return { preparation: { ...preparation, outcomes: [...preparation.outcomes, item] }, recordedId: item.id };
}

/** `canSave` (FollowUpPreparationView.swift:100), less the screen's own loading/busy flags. */
export function canSavePreparation(preparation: FollowUpPreparation): boolean {
  return preparation.company.trim() !== '' && preparation.purpose.trim() !== '';
}

/** "Add" is off for a blank step or a full list (:53-54). */
export function canAddCheck(preparation: FollowUpPreparation, title: string): boolean {
  return title.trim() !== '' && preparation.checklist.length < FOLLOW_UP_LIMITS.checklist;
}

/**
 * The first load with nothing saved fills the contact from the one picked on the Action screen, or
 * typed there (`load()`, :101-108). A saved preparation always wins.
 */
export function preparationAfterLoad(
  envelope: FollowUpEnvelope,
  local: FollowUpPreparation,
  recipient: { name: string; phone: string; email: string } | null | undefined,
): FollowUpPreparation {
  if (envelope.preparation) return envelope.preparation;
  if (!recipient) return local;
  return { ...local, company: recipient.name, phone: recipient.phone, email: recipient.email };
}

/** Outcome history label (:84): "No answer", else the capitalised result. */
export function outcomeLabel(result: FollowUpResult): string {
  return result === 'noAnswer' ? 'No answer' : result.charAt(0).toUpperCase() + result.slice(1);
}
