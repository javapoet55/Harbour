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
 * Wish Message. The greeting wins when the Wish Message is empty or still an untouched default, and
 * the change needs a fresh Save Message. `cardGreeting` is always cleared.
 *
 * "An untouched default" is any wording this app generates, for any title — not only the suggestion
 * for the title the moment carries now. Matching the current title alone meant that renaming a moment
 * (or changing its type, which rewrites an automatic title) turned its unedited default into
 * something that looked hand-written, and the card greeting was dropped instead of adopted.
 *
 * Swift mutates `inout`; here the reconciled settings come back alongside the flag, and `adopted` is
 * Swift's `@discardableResult` "the Wish Message changed".
 */
/**
 * `WishMessage.oldDefaultPatterns` (ios/Sources/NexdoCore/WishMessage.swift:30-37): the wordings older
 * versions saved as the Wish Message, for any title — the birthday/anniversary/custom placeholder, the
 * get-well text, and the festival fallback in each tone.
 *
 * Whole-string patterns rather than suffixes, so `.` stops at a newline exactly as Swift's
 * `NSRegularExpression` does and a hand-written message whose last line happens to end this way is not
 * mistaken for a default.
 *
 * The last two are NOT in Swift's list, and are kept because both platforms have saved them: they are
 * `fallbackWish(…, 'getWellSoon')`, which `generate()` writes for an offline Get Well Soon draft with
 * `manuallyEdited: false`. Swift's `FestivalValidation.fallback` produces the same two strings, so its
 * list misses a default it writes itself.
 */
const OLD_DEFAULT_PATTERNS = [
  /^.+! Sending you warm wishes on your special day\.$/,
  /^Get well soon\. Wishing you comfort, rest, and brighter days ahead\.$/,
  /^.+! Wishing you and your family a joyful celebration filled with happiness and new beginnings! ✨$/,
  /^.+! Wishing you joy and happiness\.$/,
  /^.+! Here’s to a celebration full of smiles, good company, and wonderful memories! ✨$/,
  /^.+! Thinking of you and your family and sending warm wishes for a joyful celebration\.$/,
  /^Get well soon\. Thinking of you\.$/,
  /^Get well soon\. Sending care, comfort, and warm wishes for brighter days ahead\.$/,
];

/** True when `base` is a default this app generated for some title, rather than something written. */
export function isGeneratedDefault(base: string): boolean {
  return OLD_DEFAULT_PATTERNS.some((pattern) => pattern.test(base));
}

export function reconcileCardGreeting(settings: FestivalSettings): { settings: FestivalSettings; adopted: boolean } {
  const greeting = settings.cardGreeting;
  const cleared: FestivalSettings = { ...settings, cardGreeting: null };
  if (greeting == null || greeting.trim() === '' || greeting === settings.baseMessage) return { settings: cleared, adopted: false };
  // `isUntouchedDefault` (WishMessage.swift:38-43). The suggestion for the moment's current title is
  // one of the patterns, so it no longer has to be passed in.
  const base = settings.baseMessage.trim();
  if (!(base === '' || (!settings.manuallyEdited && isGeneratedDefault(base)))) return { settings: cleared, adopted: false };
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
