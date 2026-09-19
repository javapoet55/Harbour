import type { ImportantMoment, WishDeliveryPlan } from '../api/moments';
import type { GroceryList } from '../api/shopping';
import { dayKey } from './taskQuery';

/**
 * The pure logic behind the Phase 11 Today changes: the Quick Access statuses, the moment count in
 * the summary line, and the attention row. Each function names the Swift it was ported from.
 */

// MARK: Moments

/** `WishDeliveryPlan.date` (ImportantMoment.swift:32): an unparseable instant is `.distantPast`. */
function planInstant(plan: WishDeliveryPlan): number {
  const parsed = Date.parse(plan.scheduledAtUTC);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/** `MomentDates.day(_:zone:)` (ImportantMoment.swift:61) for a possibly-infinite instant. */
function planDay(plan: WishDeliveryPlan): string {
  const at = planInstant(plan);
  return Number.isFinite(at) ? dayKey(at, plan.timeZoneID) : '';
}

/**
 * `ImportantMomentsStore.today` (ios/App/ImportantMomentsStore.swift:65-67): enabled, occurring
 * today in the moment's own zone, not snoozed past now, and with no wish already SENT for this
 * occurrence. `.count` of this is the "Z Moments" in the Today summary (RootView.swift:1084).
 */
export function momentsDueToday(moments: ImportantMoment[], now: number = Date.now()): ImportantMoment[] {
  return moments.filter((moment) => {
    if (!moment.enabled) return false;
    if (moment.nextOccurrence !== dayKey(now, moment.timeZoneID)) return false;
    // `MomentDates.parseInstant(m.snoozedUntil ?? "") ?? .distantPast) <= Date()`
    const snoozed = moment.snoozedUntil ? Date.parse(moment.snoozedUntil) : Number.NaN;
    if (!Number.isNaN(snoozed) && snoozed > now) return false;
    const plans = moment.drafts.flatMap((draft) => draft.plans ?? []);
    return !plans.some((plan) => plan.status === 'SENT' && planDay(plan) === moment.nextOccurrence);
  });
}

/**
 * `FestivalSettings.read(_:)` (ios/Sources/NexdoCore/FestivalManagement.swift:3-21).
 *
 * Swift decodes with the SYNTHESISED `Decodable`, which ignores the property defaults: every
 * non-optional key must be present with the right JSON type or the whole read is `nil`. So a bare
 * `"{}"` — the column default — reads as nil, and only settings the festival editor wrote read back.
 * Only the two fields Today needs are returned.
 */
export function readFestivalSettings(raw: string | null | undefined): { groupID: string; archived: boolean } | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const settings = value as Record<string, unknown>;
  const strings = ['groupID', 'catalogID', 'baseMessage', 'tone', 'personalContext', 'imageID', 'imageStyle', 'imageAspect', 'imagePrompt'];
  const booleans = ['catalogManaged', 'manuallyEdited', 'includeImage', 'archived'];
  const objects = ['overrides', 'channels', 'contactIDs', 'automatic', 'selected'];
  if (!strings.every((key) => typeof settings[key] === 'string')) return null;
  if (!booleans.every((key) => typeof settings[key] === 'boolean')) return null;
  if (!Number.isInteger(settings.prepareDays)) return null;
  if (!objects.every((key) => typeof settings[key] === 'object' && settings[key] !== null && !Array.isArray(settings[key]))) return null;
  return { groupID: settings.groupID as string, archived: settings.archived as boolean };
}

const GREETING_CARD_TYPES = ['birthday', 'anniversary', 'festival', 'getWellSoon'];

/** `ImportantMoment.hasRecipient` (ImportantMoment.swift:14). */
function hasRecipient(moment: ImportantMoment): boolean {
  return [moment.firstName, moment.phone, moment.email].some((value) => value.trim().length > 0);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * `MomentDisplayGroup.groups(_:)` (ImportantMoment.swift:126-144): moments that share a greeting-card
 * group, or a festival with recipients on the same day, collapse into one entry. Order is first
 * appearance.
 */
export function momentDisplayGroups(moments: ImportantMoment[]): ImportantMoment[][] {
  const order: string[] = [];
  const entries = new Map<string, ImportantMoment[]>();
  for (const moment of moments) {
    const settings = GREETING_CARD_TYPES.includes(moment.type) ? readFestivalSettings(moment.festivalSettings) : null;
    let key: string;
    if (settings) {
      key = `${moment.type}-group:${settings.groupID}`;
    } else if (moment.type === 'festival' && hasRecipient(moment)) {
      key = [moment.title.trim().toLowerCase(), moment.nextOccurrence, moment.timeZoneID, String(moment.yearly)]
        .map((part) => `${utf8Length(part)}:${part}`)
        .join('');
    } else {
      key = `moment:${moment.id}`;
    }
    if (!entries.has(key)) {
      order.push(key);
      entries.set(key, []);
    }
    entries.get(key)!.push(moment);
  }
  return order.map((key) => entries.get(key)!);
}

/**
 * `upcomingCount` (ios/App/TodayQuickAccess.swift:27-31): the enabled moments on or after today in
 * their own zone, counted as display groups. The tile reads "N upcoming".
 */
export function upcomingMomentCount(moments: ImportantMoment[], now: number = Date.now()): number {
  return momentDisplayGroups(moments.filter((moment) => moment.enabled && moment.nextOccurrence >= dayKey(now, moment.timeZoneID))).length;
}

// MARK: Shopping

/**
 * `nextList` (TodayQuickAccess.swift:24-26): the earliest uncompleted list by its `yyyy-MM-dd` date.
 * `sorted(by:)` is not stable in Swift, so ties have no defined winner; this keeps the server order.
 */
export function nextShoppingList(lists: GroceryList[]): GroceryList | null {
  const open = lists.filter((list) => list.completedAt == null);
  if (open.length === 0) return null;
  return [...open].sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0))[0];
}

/** `GroceryList.remaining` (ShoppingList.swift:43). */
export function remainingItems(list: GroceryList): number {
  return list.items.filter((item) => !item.checked).length;
}

/**
 * The weekday of a list's `yyyy-MM-dd` date: `dateFormat = "EEE"` over `MomentDates.date(list.date,
 * zone: list.timeZone)`, formatted in the same zone — so it is the calendar weekday of that date.
 */
function shortWeekday(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/**
 * `shoppingSubtitle` (TodayQuickAccess.swift:32-40). A failed refresh reads "View lists", no open
 * list reads "Your lists", otherwise "N items · Fri" — Swift does not singularise "items".
 */
export function shoppingSubtitle(lists: GroceryList[], failed: boolean): string {
  if (failed) return 'View lists';
  const list = nextShoppingList(lists);
  if (!list) return 'Your lists';
  return `${remainingItems(list)} items · ${shortWeekday(list.date)}`;
}

// MARK: The "Your day, in focus" summary

/**
 * `TodayIntelligenceCard` (RootView.swift:1403, 1411-1413, commit e0a7bcd): the moment count is part
 * of the commitment total, and the line under it is "X Tasks · Y Appointments · Z Moments".
 */
export function commitmentCount(tasks: number, appointments: number, moments: number): number {
  return tasks + appointments + moments;
}

export function commitmentHeadline(total: number, today: boolean): string {
  return `${total} commitment${total === 1 ? '' : 's'} ${today ? 'today' : 'ahead'}`;
}

export function summaryLine(tasks: number, appointments: number, moments: number): string {
  return `${tasks} Task${tasks === 1 ? '' : 's'} · ${appointments} Appointment${appointments === 1 ? '' : 's'} · ${moments} Moment${moments === 1 ? '' : 's'}`;
}

// MARK: The attention row

/**
 * The attention row's subtitle (RootView.swift:1151-1156, commit 63d9542): overdue tasks first, with
 * the other schedule checks as a suffix; with no overdue tasks, only the checks.
 */
export function attentionRowSubtitle(overdue: number, other: number): string {
  if (overdue > 0) return `${overdue} overdue task${overdue === 1 ? '' : 's'}${other > 0 ? ` · ${other} other` : ''}`;
  return `${other} schedule check${other === 1 ? '' : 's'}`;
}

/** `if overdueCount + otherCount > 0` (RootView.swift:1148). */
export function showsAttentionRow(overdue: number, other: number): boolean {
  return overdue + other > 0;
}
