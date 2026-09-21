import type { MessageComposeOutcome } from '../../actions/composers';
import type { FestivalCatalogEntry, ImportantMoment, MomentInput, PlanAction, WishDeliveryPlan, WishDraft } from '../../api/moments';
import { deviceZone, momentDate, momentDay, parseInstant, upcomingGroupFor, zonedInstant, type UpcomingGroup } from './dates';

/**
 * The pure Important Moments model: `ImportantMoment.swift`, `FestivalManagement.swift`,
 * `MomentTitles.swift`, `MomentGreeting.swift` and `GreetingCardSignature.swift` in
 * ios/Sources/NexdoCore. Nothing here touches the network or the device.
 */

export const MOMENT_TYPES = ['birthday', 'anniversary', 'festival', 'getWellSoon', 'custom'] as const;

/** Foundation's `String.capitalized`: every whitespace-separated word, first letter up, rest down. */
export function capitalized(value: string): string {
  return value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** `ImportantMoment.label(for:)` (ImportantMoment.swift:11). */
export function typeLabel(type: string): string {
  return type === 'getWellSoon' ? 'Get Well Soon' : capitalized(type);
}

/** `supportsGreetingCard` (ImportantMoment.swift:12). Custom is the only type without a card. */
export function supportsGreetingCard(moment: Pick<ImportantMoment, 'type'>): boolean {
  return ['birthday', 'anniversary', 'festival', 'getWellSoon'].includes(moment.type);
}

/** `hasRecipient` (ImportantMoment.swift:14). */
export function hasRecipient(moment: Pick<ImportantMoment, 'firstName' | 'phone' | 'email'>): boolean {
  return [moment.firstName, moment.phone, moment.email].some((value) => value.trim() !== '');
}

/**
 * `isArchived` (ImportantMoment.swift:15-19): the raw JSON's `archived` flag, read on its own — NOT
 * through `FestivalSettings.read`, which rejects the `{"archived":true}` a deleted festival keeps.
 */
export function isArchived(moment: Pick<ImportantMoment, 'festivalSettings'>): boolean {
  if (!moment.festivalSettings) return false;
  try {
    const parsed: unknown = JSON.parse(moment.festivalSettings);
    return typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>).archived === true;
  } catch {
    return false;
  }
}

/** `latest` (ImportantMoment.swift:20): the server orders drafts newest first. */
export function latestDraft(moment: Pick<ImportantMoment, 'drafts'>): WishDraft | undefined {
  return moment.drafts[0];
}

export function allPlans(moment: Pick<ImportantMoment, 'drafts'>): WishDeliveryPlan[] {
  return moment.drafts.flatMap((draft) => draft.plans ?? []);
}

/** `WishDeliveryPlan.date` (ImportantMoment.swift:32). */
export function planDate(plan: Pick<WishDeliveryPlan, 'scheduledAtUTC'>): number {
  return parseInstant(plan.scheduledAtUTC) ?? -8_640_000_000_000_000;
}

/** `editable` (ImportantMoment.swift:33). */
export function planEditable(plan: Pick<WishDeliveryPlan, 'status'>): boolean {
  return ['SCHEDULED', 'AWAITING_CONFIRMATION', 'FAILED'].includes(plan.status);
}

/** The `lastError` the server records for a Messages plan opened without a confirmed send. */
export const OPENED_UNCONFIRMED = 'Messages opened; delivery not confirmed.';

/**
 * The `plan` action recording a Messages composer outcome: `sent` only for a verified send,
 * `failed` only for a real composer error, and `opened` when the platform cannot tell us which
 * happened. `null` for a cancelled composer, which each screen handles its own way.
 */
export function composerPlanAction(outcome: MessageComposeOutcome): PlanAction | null {
  switch (outcome) {
    case 'submitted':
      return 'sent';
    case 'unknown':
      return 'opened';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

/** `statusLabel` (ImportantMoment.swift:34-42). */
export function planStatusLabel(plan: Pick<WishDeliveryPlan, 'status' | 'lastError'>): string {
  switch (plan.status) {
    case 'SCHEDULED':
      return 'Auto-send scheduled';
    case 'AWAITING_CONFIRMATION':
      return plan.lastError === OPENED_UNCONFIRMED ? 'Opened — delivery not confirmed' : 'Confirmation required';
    case 'SENT':
      return 'Sent';
    case 'COPIED':
      return 'Copied — delivery not confirmed';
    case 'SHARED':
      return 'Shared — delivery not confirmed';
    case 'UNCERTAIN':
      return 'Check Sent mail';
    default:
      return capitalized(plan.status).replace(/_/g, ' ');
  }
}

export const HISTORY_STATUSES = ['SENT', 'COPIED', 'SHARED'];

/** `upcomingDelivery` (ImportantMoment.swift:86-91). */
export function upcomingDelivery(moment: ImportantMoment): WishDeliveryPlan | undefined {
  return allPlans(moment)
    .filter((plan) => ['SCHEDULED', 'AWAITING_CONFIRMATION'].includes(plan.status) && momentDay(planDate(plan), moment.timeZoneID) === moment.nextOccurrence)
    .sort((a, b) => planDate(a) - planDate(b))[0];
}

/** `readyToSchedule` (ImportantMoment.swift:93-99). Approval is not scheduling; each year needs a fresh review. */
export function readyToSchedule(moment: ImportantMoment): boolean {
  if (!moment.enabled || upcomingDelivery(moment) || moment.occurrenceDate !== moment.nextOccurrence) return false;
  if (supportsGreetingCard(moment)) {
    const settings = readFestivalSettings(moment.festivalSettings);
    if (settings) return settings.approvedAt != null && settings.baseMessage.trim() !== '';
  }
  const latest = latestDraft(moment);
  return latest?.status === 'READY' && !(latest.plans ?? []).some((plan) => HISTORY_STATUSES.includes(plan.status));
}

/** `needsWishReview` (ImportantMoment.swift:100). */
export function needsWishReview(moment: ImportantMoment): boolean {
  return moment.enabled && !upcomingDelivery(moment) && !readyToSchedule(moment);
}

export function upcomingGroup(moment: ImportantMoment, now: number = Date.now()): UpcomingGroup {
  return upcomingGroupFor(moment.nextOccurrence, moment.timeZoneID, now);
}

/** `ImportantMoment.icon` (ImportantMoment.swift:13), as an Ionicons name for `Label(_, systemImage:)`. */
export function momentIcon(type: string): string {
  switch (type) {
    case 'birthday':
      return 'gift';
    case 'anniversary':
      return 'heart';
    case 'festival':
      return 'sparkles';
    case 'getWellSoon':
      return 'medkit';
    default:
      return 'star';
  }
}

// ---------------------------------------------------------------------------------------------
// FestivalSettings (FestivalManagement.swift:3-21)

export type FestivalSettings = {
  groupID: string;
  prepareDays: number;
  catalogID: string;
  catalogManaged: boolean;
  baseMessage: string;
  tone: string;
  personalContext: string;
  manuallyEdited: boolean;
  approvedAt?: string | null;
  includeImage: boolean;
  imageID: string;
  imageStyle: string;
  imageAspect: string;
  imagePrompt: string;
  draftSendDate?: string | null;
  draftNotify?: boolean | null;
  cardSignature?: string | null;
  cardGreeting?: string | null;
  overrides: Record<string, string>;
  channels: Record<string, string>;
  contactIDs: Record<string, string>;
  automatic: Record<string, boolean>;
  selected: Record<string, boolean>;
  catalogNotice?: string | null;
  archived: boolean;
};

export function newFestivalSettings(groupID: string): FestivalSettings {
  return {
    groupID,
    prepareDays: 7,
    catalogID: '',
    catalogManaged: false,
    baseMessage: '',
    tone: 'Warm',
    personalContext: '',
    manuallyEdited: false,
    includeImage: false,
    imageID: '',
    imageStyle: 'Traditional',
    imageAspect: 'Portrait',
    imagePrompt: '',
    overrides: {},
    channels: {},
    contactIDs: {},
    automatic: {},
    selected: {},
    archived: false,
  };
}

const REQUIRED: Record<string, 'string' | 'number' | 'boolean' | 'object'> = {
  groupID: 'string',
  prepareDays: 'number',
  catalogID: 'string',
  catalogManaged: 'boolean',
  baseMessage: 'string',
  tone: 'string',
  personalContext: 'string',
  manuallyEdited: 'boolean',
  includeImage: 'boolean',
  imageID: 'string',
  imageStyle: 'string',
  imageAspect: 'string',
  imagePrompt: 'string',
  overrides: 'object',
  channels: 'object',
  contactIDs: 'object',
  automatic: 'object',
  selected: 'object',
  archived: 'boolean',
};

/**
 * `FestivalSettings.read(_:)`. Swift's synthesised `Decodable` needs EVERY non-optional key present,
 * default value or not, so the `"{}"` a plain `save` leaves and the `{"archived":true}` a delete leaves
 * both read as `nil`. That decides which moments group together, so it is reproduced exactly.
 */
export function readFestivalSettings(raw: string | null | undefined): FestivalSettings | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  for (const [key, kind] of Object.entries(REQUIRED)) {
    const value = record[key];
    if (kind === 'object' ? typeof value !== 'object' || value === null || Array.isArray(value) : typeof value !== kind) return null;
  }
  return parsed as FestivalSettings;
}

/** `JSONEncoder` with `.sortedKeys`: the dirty-check fingerprint and the payload share one encoding. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined && record[key] !== null)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

// ---------------------------------------------------------------------------------------------
// MomentDisplayGroup (ImportantMoment.swift:120-145)

export type MomentDisplayGroup = { id: string; moments: ImportantMoment[] };

/** Swift's `String.utf8.count`. */
function utf8Length(value: string): number {
  let length = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return length;
}

/** `MomentDisplayGroup.groups(_:)`: display grouping only; drafts and deliveries stay per recipient. */
export function displayGroups(moments: ImportantMoment[]): MomentDisplayGroup[] {
  const order: string[] = [];
  const entries = new Map<string, ImportantMoment[]>();
  for (const moment of moments) {
    let key: string;
    const settings = supportsGreetingCard(moment) ? readFestivalSettings(moment.festivalSettings) : null;
    if (settings) key = `${moment.type}-group:${settings.groupID}`;
    else if (moment.type === 'festival' && hasRecipient(moment)) {
      const title = moment.title.trim().toLowerCase();
      key = [title, moment.nextOccurrence, moment.timeZoneID, String(moment.yearly)].map((part) => `${utf8Length(part)}:${part}`).join('');
    } else key = `moment:${moment.id}`;
    if (!entries.has(key)) {
      order.push(key);
      entries.set(key, []);
    }
    entries.get(key)!.push(moment);
  }
  return order.map((id) => ({ id, moments: entries.get(id)! }));
}

/** `MomentDisplayGroup.editableGroups(_:)`: archived recipients are never edited, only kept as history. */
export function editableGroups(moments: ImportantMoment[]): MomentDisplayGroup[] {
  return displayGroups(moments.filter((moment) => !isArchived(moment)));
}

// ---------------------------------------------------------------------------------------------
// ManagedFestivalRecipient (FestivalManagement.swift:22-36)

export type ManagedRecipient = {
  momentID?: string;
  key: string;
  name: string;
  phone: string;
  email: string;
  selected: boolean;
  contactIdentifier: string;
};

export function recipientInitials(name: string): string {
  return name
    .split(' ')
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => [...word][0])
    .join('');
}

export function maskedAddress(recipient: Pick<ManagedRecipient, 'phone' | 'email'>, channel: string): string {
  if (channel === 'email') {
    const parts = recipient.email.split('@').filter((part) => part !== '');
    return parts.length === 2 ? `Email · ${[...parts[0]][0]}••••@${parts[1]}` : 'Choose email';
  }
  return channel === 'messages' ? `Mobile · ••• ••• ${recipient.phone.replace(/\D/g, '').slice(-4)}` : 'Copy / Share';
}

// ---------------------------------------------------------------------------------------------
// FestivalValidation (FestivalManagement.swift:37-87)

export function normalizedPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return value.startsWith('+') ? `+${digits}` : digits;
}

export function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateRecipients(values: ManagedRecipient[], settings: FestivalSettings): string | null {
  const selected = values.filter((value) => value.selected);
  if (selected.length === 0) return 'Select at least one recipient.';
  const used = new Set<string>();
  for (const value of selected) {
    if (value.name.trim() === '') return 'Enter a recipient name.';
    const channel = settings.channels[value.key] ?? (value.phone === '' ? 'email' : 'messages');
    const address = channel === 'email' ? value.email.toLowerCase().trim() : normalizedPhone(value.phone);
    if (channel === 'email' && !validEmail(address)) return `Choose a valid email address for ${value.name}.`;
    const digits = address.replace(/\D/g, '').length;
    if (channel === 'messages' && !(digits >= 7 && digits <= 15)) return `Choose a valid phone number for ${value.name}.`;
    if (channel !== 'share') {
      if (used.has(channel + address)) return 'Remove duplicate delivery addresses.';
      used.add(channel + address);
    }
  }
  return null;
}

export function validateSchedule({
  settings,
  date,
  active,
  emailReady,
  recipients,
  now = Date.now(),
}: {
  settings: FestivalSettings;
  date: number;
  active: boolean;
  emailReady: boolean;
  recipients: ManagedRecipient[];
  now?: number;
}): string | null {
  if (!active) return 'Enable the festival before scheduling.';
  const recipientError = validateRecipients(recipients, settings);
  if (recipientError) return recipientError;
  if (settings.baseMessage.trim() === '' || [...settings.baseMessage].length > 500) return 'Enter a wish of 1–500 characters.';
  if (settings.approvedAt == null) return 'Review and save the message before scheduling.';
  if (date <= now) return 'Choose a future delivery time.';
  if (settings.includeImage) return 'Image delivery is not configured. Exclude the preview image to schedule a text wish.';
  for (const recipient of recipients.filter((value) => value.selected)) {
    const channel = settings.channels[recipient.key] ?? 'messages';
    if (channel === 'share') return 'Copy / Share is available now from Review Wish; choose Messages or Email to schedule.';
    if (channel === 'email' && !emailReady) return 'Connect email and enable the backend scheduler first.';
  }
  return null;
}

export { zonedInstant };

export function fallbackWish(name: string, tone: string, type = 'festival'): string {
  if (type === 'getWellSoon') {
    return tone === 'Short' ? 'Get well soon. Thinking of you.' : 'Get well soon. Sending care, comfort, and warm wishes for brighter days ahead.';
  }
  switch (tone) {
    case 'Short':
      return `${name}! Wishing you joy and happiness.`;
    case 'Fun':
      return `${name}! Here’s to a celebration full of smiles, good company, and wonderful memories! ✨`;
    case 'Personal':
      return `${name}! Thinking of you and your family and sending warm wishes for a joyful celebration.`;
    default:
      return `${name}! Wishing you and your family a joyful celebration filled with happiness and new beginnings! ✨`;
  }
}

/** `FestivalCatalogEntry.next(after:)`. */
export function catalogNext(entry: FestivalCatalogEntry, day: string): string | undefined {
  return [...entry.dates].sort().find((value) => value >= day);
}

/** Swift's `String.count`: grapheme-ish. Code points are close enough for the 500 limit. */
export function characterCount(value: string): number {
  return [...value].length;
}

// ---------------------------------------------------------------------------------------------
// MomentTitles (MomentTitles.swift)

export function defaultTitle(type: string, firstName: string): string | null {
  const name = firstName.trim();
  switch (type) {
    case 'birthday':
      return name === '' ? 'Happy Birthday' : `${name}’s Birthday`;
    case 'anniversary':
      return name === '' ? 'Happy Anniversary' : `${name}’s Anniversary`;
    case 'getWellSoon':
      return 'Get Well Soon';
    default:
      return null;
  }
}

export function updatingTitle(title: string, oldType: string, oldName: string, newType: string, newName: string): string {
  const current = title.trim();
  const automatic = current === '' || current === defaultTitle(oldType, oldName) || current === defaultTitle(oldType, '');
  return automatic ? (defaultTitle(newType, newName) ?? '') : title;
}

// ---------------------------------------------------------------------------------------------
// MomentGreeting (MomentGreeting.swift)

export function greetingHeading(type: string, firstName: string): string | null {
  const name = firstName.trim();
  if (name === '') return null;
  switch (type) {
    case 'birthday':
      return `Happy Birthday, ${name}!`;
    case 'anniversary':
      return `Happy Anniversary, ${name}!`;
    case 'getWellSoon':
      return `Get well soon, ${name}!`;
    default:
      return null;
  }
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** The case-insensitive whole-word test Swift writes as a look-around regex. */
function containsName(body: string, name: string): boolean {
  if (name === '') return false;
  const haystack = body.toLowerCase();
  const needle = name.toLowerCase();
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const before = index > 0 ? body[index - 1] : '';
    const after = body[index + needle.length] ?? '';
    if (!(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after))) return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

/** `MomentGreeting.message(_:type:firstName:)`: each recipient's wish names them once. */
export function greetingMessage(body: string, type: string, firstName: string): string {
  const greeting = greetingHeading(type, firstName);
  if (!greeting) return body;
  if (containsName(body, firstName.trim())) return body;
  const opening = type === 'birthday' ? 'Happy Birthday' : type === 'anniversary' ? 'Happy Anniversary' : 'Get well soon';
  const text = body.trim();
  if (text.toLowerCase().startsWith(opening.toLowerCase())) {
    const remainder = text.slice(opening.length);
    if (remainder === '' || '!. \n'.includes(remainder[0])) {
      const rest = remainder.replace(/^[!. \n]+/, '');
      return greeting + (rest === '' ? '' : ` ${rest}`);
    }
  }
  return `${greeting} ${text}`;
}

// ---------------------------------------------------------------------------------------------
// GreetingCardSignature (GreetingCardSignature.swift)

export function defaultSignature(profileName: string): string {
  const first = profileName.split(/\s+/).find((word) => word !== '');
  if (!first) return 'With love, your family';
  return [...`With love, ${first} & family`].slice(0, 80).join('');
}

// ---------------------------------------------------------------------------------------------
// MomentInput (ImportantMoment.swift:75-80)

export function newMomentInput(sourceKey: string, zone: string = deviceZone()): MomentInput {
  return {
    type: 'birthday',
    title: '',
    firstName: '',
    phone: '',
    email: '',
    occurrenceDate: '',
    timeZoneID: zone,
    yearly: true,
    source: 'manual',
    sourceKey,
  };
}

// ---------------------------------------------------------------------------------------------
// List filters (ImportantMomentsView.swift:218, :270-274) and the store's derived lists
// (ImportantMomentsStore.swift:63-68)

export type MomentsTab = 'Upcoming' | 'Scheduled' | 'Sent';
export const TYPE_FILTERS = ['All', 'Birthday', 'Anniversary', 'Festival', 'Get Well Soon', 'Custom'] as const;
export const DELIVERY_FILTERS = ['All', 'Automatic', 'Confirmation', 'Action needed'] as const;

/** `plans` (ImportantMomentsStore.swift:64): every plan, soonest first. */
export function sortedPlans(moments: ImportantMoment[]): WishDeliveryPlan[] {
  return moments.flatMap(allPlans).sort((a, b) => planDate(a) - planDate(b));
}

/** `displayed` (ImportantMomentsView.swift:218). Swift's `localizedCaseInsensitiveContains` for search. */
export function displayedMoments(
  moments: ImportantMoment[],
  { tab, filter, search }: { tab: MomentsTab; filter: string; search: string },
  now: number = Date.now(),
): ImportantMoment[] {
  const wanted = filter === 'Get Well Soon' ? 'getWellSoon' : filter.toLowerCase();
  return moments
    .filter(
      (moment) =>
        (tab === 'Sent' || !isArchived(moment)) &&
        (tab !== 'Upcoming' || moment.nextOccurrence >= momentDay(now, moment.timeZoneID)) &&
        (filter === 'All' || moment.type === wanted) &&
        (search === '' || moment.title.toLowerCase().includes(search.toLowerCase())),
    )
    .sort((a, b) => (a.nextOccurrence < b.nextOccurrence ? -1 : a.nextOccurrence > b.nextOccurrence ? 1 : 0));
}

/** The Scheduled and Sent tabs (ImportantMomentsView.swift:270-274). */
export function tabPlans(
  plans: WishDeliveryPlan[],
  displayed: ImportantMoment[],
  { tab, deliveryFilter }: { tab: MomentsTab; deliveryFilter: string },
): WishDeliveryPlan[] {
  return plans.filter((plan) => {
    const matches = displayed.some((moment) => moment.drafts.some((draft) => draft.id === plan.draftID));
    const history = HISTORY_STATUSES.includes(plan.status);
    return (
      matches &&
      (tab === 'Sent' ? history : !history && plan.status !== 'CANCELLED') &&
      (deliveryFilter === 'All' ||
        tab === 'Sent' ||
        (deliveryFilter === 'Automatic' && plan.automaticDelivery) ||
        (deliveryFilter === 'Confirmation' && !plan.automaticDelivery) ||
        (deliveryFilter === 'Action needed' && ['FAILED', 'UNCERTAIN', 'EXPIRED'].includes(plan.status)))
    );
  });
}

/** `today` (ImportantMomentsStore.swift:65-67): the Today card's moments. */
export function todayMoments(moments: ImportantMoment[], now: number = Date.now()): ImportantMoment[] {
  return moments.filter(
    (moment) =>
      moment.enabled &&
      moment.nextOccurrence === momentDay(now, moment.timeZoneID) &&
      (parseInstant(moment.snoozedUntil) ?? -Infinity) <= now &&
      !allPlans(moment).some((plan) => plan.status === 'SENT' && momentDay(planDate(plan), plan.timeZoneID) === moment.nextOccurrence),
  );
}

/**
 * The Quick Access tile's count (TodayQuickAccess.swift:27-31), for Run A's tile: enabled moments
 * from today on, grouped the way the list groups them.
 */
export function upcomingMomentCount(moments: ImportantMoment[], now: number = Date.now()): number {
  return displayGroups(moments.filter((moment) => moment.enabled && moment.nextOccurrence >= momentDay(now, moment.timeZoneID))).length;
}

/** The moment a plan belongs to. */
export function momentForPlan(moments: ImportantMoment[], plan: Pick<WishDeliveryPlan, 'draftID'>): ImportantMoment | undefined {
  return moments.find((moment) => moment.drafts.some((draft) => draft.id === plan.draftID));
}

export { momentDate };
