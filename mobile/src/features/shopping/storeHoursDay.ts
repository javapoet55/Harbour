/**
 * `ShoppingStoreHoursDay` (bb57e09, ios/Sources/NexdoCore/ShoppingStoreHoursDay.swift): which of
 * Google's "Friday: 10 AM–8:30 PM" rows is TODAY at the store, so Store Hours can bold it. The rows
 * are requested in English and matched by weekday name rather than assuming the list starts on a
 * given day. "Today" is the store's own day, from the `utcOffsetMinutes` the hours route now returns
 * (src/server/shopping/store-hours.ts); without a valid offset the phone's zone is used.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** `isToday(_:at:utcOffsetMinutes:)` (:6-15). Swift re-evaluates every minute; so should the screen. */
export function storeHoursRowIsToday(description: string, at: number = Date.now(), utcOffsetMinutes?: number | null): boolean {
  const offset = typeof utcOffsetMinutes === 'number' && Number.isInteger(utcOffsetMinutes) && utcOffsetMinutes >= -840 && utcOffsetMinutes <= 840 ? utcOffsetMinutes : null;
  const weekday = offset === null ? new Date(at).getDay() : new Date(at + offset * 60_000).getUTCDay();
  // `split(separator: ":", maxSplits: 1).first`, which skips an empty leading piece.
  const colon = description.indexOf(':');
  const head = colon < 0 ? description : colon === 0 ? description.slice(1) : description.slice(0, colon);
  return head.trim().toLowerCase() === WEEKDAYS[weekday].toLowerCase();
}

/** The row's accessibility label: "Today, " first on today's row. */
export function storeHoursRowLabel(description: string, today: boolean): string {
  return today ? `Today, ${description}` : description;
}
