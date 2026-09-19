import type { GroceryList } from '../api/shopping';

/**
 * The pure logic behind the Phase 11 Today changes: the Shopping status, the summary line and the
 * attention row. The moment counts are Run B's `todayMoments` and `upcomingMomentCount`
 * (src/features/moments/domain.ts), read from the one Moments store, as Swift's Today reads
 * `ImportantMomentsStore`.
 */

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
