import { characterCount, fallbackWish, stableStringify, type FestivalSettings, type ManagedRecipient } from './domain';

/**
 * `WishMessage` (ios/Sources/NexdoCore/WishMessage.swift): one wish per moment — the Wish Message is
 * the text scheduled for delivery and the text printed on the card.
 */

/**
 * `WishMessage.suggestion(type:title:)`. Suggested wording shown as a placeholder while the Wish
 * Message is empty. Never saved unless the user taps "Use suggestion".
 */
export function wishSuggestion(type: string, title: string): string {
  if (type === 'getWellSoon') return 'Get well soon. Wishing you comfort, rest, and brighter days ahead.';
  if (type === 'festival') return fallbackWish(title, 'Warm');
  return `${title}! Sending you warm wishes on your special day.`;
}

/**
 * `WishMessage.card(_:recipientKey:)`. The text printed on a recipient's card: their personalized
 * message, else the shared Wish Message. Without a recipient (the shared preview) it is the Wish Message.
 */
export function cardWish(settings: FestivalSettings, recipientKey?: string | null): string {
  if (recipientKey != null) {
    const custom = settings.overrides[recipientKey];
    if (custom !== undefined) return custom;
  }
  return settings.baseMessage;
}

/**
 * `WishMessage.initial(saved:latestBody:latestStatus:)`. The text to start editing with when nothing
 * is saved: a draft the user approved in Review Wish, else empty.
 */
export function initialWish(saved: string, latestBody: string | null | undefined, latestStatus: string | null | undefined): string {
  if (saved !== '') return saved;
  if (latestBody == null || !['READY', 'PLANNED'].includes(latestStatus ?? '') || latestBody.trim() === '') return '';
  return latestBody;
}

/**
 * `WishMessage.reconcile(_:suggestion:)`. Folds a card-only greeting saved by older versions into the
 * Wish Message. The greeting wins when the Wish Message is empty or still the untouched suggestion,
 * and the change needs a fresh Save Message. `cardGreeting` is always cleared.
 *
 * Swift mutates `inout`; here the reconciled settings come back alongside the flag, and `adopted` is
 * Swift's `@discardableResult` "the Wish Message changed".
 */
export function reconcileCardGreeting(settings: FestivalSettings, suggestion: string): { settings: FestivalSettings; adopted: boolean } {
  const greeting = settings.cardGreeting;
  const cleared: FestivalSettings = { ...settings, cardGreeting: null };
  if (greeting == null || greeting.trim() === '' || greeting === settings.baseMessage) return { settings: cleared, adopted: false };
  const base = settings.baseMessage.trim();
  if (!(base === '' || (base === suggestion && !settings.manuallyEdited))) return { settings: cleared, adopted: false };
  return {
    settings: { ...cleared, baseMessage: [...greeting].slice(0, 500).join(''), manuallyEdited: true, approvedAt: null },
    adopted: true,
  };
}

/**
 * `WishMessage.approvalError(_:)`. Why the Wish Message can't be approved yet; null when it can. An
 * empty message never falls back to the suggestion.
 */
export function approvalError(settings: FestivalSettings): string | null {
  const valid = (text: string) => text.trim() !== '' && characterCount(text) <= 500;
  return valid(settings.baseMessage) && Object.values(settings.overrides).every(valid) ? null : 'Each message must contain 1–500 characters.';
}

/** `WishMessage.sendingNow`: shown when a save is refused because the wish is being sent. */
export const SENDING_NOW = 'This wish is being sent right now, so its message can’t change. Refresh in a minute to see the result.';

/** `WishMessage.saveError(status:message:)`: the 409 "in progress" / "started" conflict, not the schedules one. */
export function wishSaveError(status: number, message: string): string | null {
  return status === 409 && (message.includes('in progress') || message.includes('delivery started')) ? SENDING_NOW : null;
}

/**
 * `FestivalChange` (WishMessage.swift). What a Manage Moment save changes, compared with the last
 * saved state. Mirrors the server's message-only rule (src/server/moments/festival.ts
 * `onlyMessageChanged`): only message and card fields changed.
 */
export type FestivalChange = 'none' | 'messageOnly' | 'delivery';

/**
 * `FestivalChange.needsCancelPrompt(approve:hasSchedules:)`. Asks to cancel existing schedules only
 * when the save changes who, when or how a wish is delivered, or saves a message without approving it.
 */
export function needsCancelPrompt(change: FestivalChange, approve: boolean, hasSchedules: boolean): boolean {
  if (!hasSchedules) return false;
  if (change === 'delivery') return true;
  if (change === 'messageOnly') return !approve;
  return false;
}

/** `FestivalEditState` (WishMessage.swift). */
export type FestivalEditState = {
  title: string;
  day: string;
  zone: string;
  yearly: boolean;
  active: boolean;
  recipients: ManagedRecipient[];
  settings: FestivalSettings;
};

/**
 * `FestivalEditState.delivery(_:)`: the settings with every message and card field blanked, i.e. what
 * decides delivery.
 *
 * These sixteen fields are the client half of the server's `messageKeys` in
 * src/server/moments/festival.ts. The two agree today: `archived` is normalised separately there
 * (`{...parsed.data, archived:false}`), and `catalogNotice` is absent from the `festivalSettings` zod
 * schema, so zod strips it from both sides before the comparison. Adding `catalogNotice` to that
 * schema without adding it to `messageKeys` would break the agreement — a notice-only change would
 * count as delivery there and message-only here, and the `cancelSchedules:false` save would 409.
 */
export function deliveryOnly(settings: FestivalSettings): FestivalSettings {
  return {
    ...settings,
    baseMessage: '',
    tone: '',
    personalContext: '',
    manuallyEdited: false,
    approvedAt: null,
    overrides: {},
    cardGreeting: null,
    cardSignature: null,
    imageID: '',
    imageStyle: '',
    imageAspect: '',
    imagePrompt: '',
    draftSendDate: null,
    draftNotify: null,
    catalogNotice: null,
    archived: false,
  };
}

/**
 * `FestivalEditState.change(from:)`. `momentID` is dropped before comparing recipients: a save that
 * only learns a newly created moment's id has not changed delivery.
 */
export function changeFrom(current: FestivalEditState, saved: FestivalEditState): FestivalChange {
  if (stableStringify(current) === stableStringify(saved)) return 'none';
  const withoutIDs = (list: ManagedRecipient[]) => stableStringify(list.map((recipient) => ({ ...recipient, momentID: '' })));
  const sameDelivery =
    current.title === saved.title &&
    current.day === saved.day &&
    current.zone === saved.zone &&
    current.yearly === saved.yearly &&
    current.active === saved.active &&
    withoutIDs(current.recipients) === withoutIDs(saved.recipients) &&
    stableStringify(deliveryOnly(current.settings)) === stableStringify(deliveryOnly(saved.settings));
  return sameDelivery ? 'messageOnly' : 'delivery';
}
