import type { CalendarConnection } from '../api/types';
import { addDays, dayKey, parseServerDate, startOfDay } from './taskQuery';

/**
 * Port of `CalendarConnection`'s presentation (ios/Sources/NexdoCore/ProfileSettings.swift:41-74) and
 * the connection copy in `ProfileSettingsView` (ios/App/ProfileView.swift:228-331) and `AppModel`
 * (ios/App/NexdoApp.swift:305-331). Commits 3a26c52 and 3ef906d.
 */

/** `providerLabel` (`:46-52`). */
export function providerLabel(connection: CalendarConnection): string {
  switch (connection.provider.toLowerCase()) {
    case 'google':
      return 'Google Calendar';
    case 'microsoft':
      return 'Outlook Calendar';
    default:
      return capitalized(connection.provider);
  }
}

/** `displayName` (`:41-45`): the calendar's name, else the account, else the provider. */
export function displayName(connection: CalendarConnection): string {
  if (connection.calendarName) return connection.calendarName;
  if (connection.accountEmail) return connection.accountEmail;
  return providerLabel(connection);
}

/** `isHealthy` (`:53`). */
export function isHealthy(connection: CalendarConnection): boolean {
  const status = connection.status.toUpperCase();
  return status === 'ACTIVE' || status === 'CONNECTED';
}

/** `detail` (`:54-59`): provider · account (when not already the name) · status (when unhealthy). */
export function connectionDetail(connection: CalendarConnection): string {
  const parts = [providerLabel(connection)];
  if (connection.accountEmail && connection.accountEmail !== displayName(connection)) parts.push(connection.accountEmail);
  if (!isHealthy(connection)) parts.push(capitalized(connection.status));
  return parts.join(' · ');
}

/**
 * The last-sync line under each connection, from `lastSyncedAt` and `status`. Ports
 * `lastSyncedDescription` (ios/Sources/NexdoCore/ProfileSettings.swift:75-88, commit 165e66c), which
 * replaced the old `RelativeDateTimeFormatter` "Synchronized 5 minutes ago" wording on both platforms.
 *
 * The checks are ordered as Swift orders them, and the first that matches wins. Status comes before the
 * timestamp: a calendar that needs reauthorizing is not syncing at all, so how long ago it last managed
 * to is not the useful fact. `relativeTime` below keeps the superseded Swift behaviour and stays
 * exported for the other ports that still read it.
 *
 * `timeZone` is the DEVICE zone (`deviceTimeZone()`), not the account's: "today" means the day the
 * phone is showing.
 */
export function lastSyncedDescription(connection: CalendarConnection, now: number, timeZone: string): string {
  // Swift compares `status.lowercased() != "connected"`, so ACTIVE is NOT connected here, unlike
  // `isHealthy` above, which the row's health icon still uses (ProfileSettings.swift:53).
  if (connection.status.toLowerCase() !== 'connected') return 'Needs reconnecting';
  const at = parseServerDate(connection.lastSyncedAt);
  if (at === null) return 'Not synced yet';
  // A server clock slightly ahead of the phone's reads as the present, never as a negative count.
  const elapsed = Math.max(0, now - at);
  if (elapsed < 60_000) return 'Last synced just now';
  if (elapsed < 3_600_000) return `Last synced ${Math.floor(elapsed / 60_000)} min ago`;
  const day = dayKey(at, timeZone);
  if (day === dayKey(now, timeZone)) return `Last synced today at ${clockTime(at, timeZone)}`;
  if (day === dayKey(addDays(startOfDay(now, timeZone), -1, timeZone), timeZone)) return `Last synced yesterday at ${clockTime(at, timeZone)}`;
  return `Last synced ${shortDate(at, timeZone)} at ${clockTime(at, timeZone)}`;
}

/** `serverTime`'s format (taskLabels.ts:10), the screen's clock style: "3:05 PM". */
function clockTime(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

/** Swift's "MMM d": "Sep 21", which is also en-US's own order for this pair. */
function shortDate(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(at));
}

/**
 * Hand-written because Hermes, the Android JavaScript engine, has no `Intl.RelativeTimeFormat`: calling
 * it threw and took the whole Settings screen down whenever a calendar was connected. English, like
 * every other string in the app.
 */
export function relativeTime(at: number, now: number): string {
  const seconds = Math.trunc((at - now) / 1000);
  const abs = Math.abs(seconds);
  const days = Math.trunc(abs / 86_400);
  const [value, unit] =
    abs < 60
      ? [abs, 'second']
      : abs < 3_600
        ? [Math.trunc(abs / 60), 'minute']
        : abs < 86_400
          ? [Math.trunc(abs / 3_600), 'hour']
          : days < 7
            ? [days, 'day']
            : days < 30
              ? [Math.trunc(days / 7), 'week']
              : days < 365
                ? [Math.trunc(days / 30), 'month']
                : [Math.trunc(days / 365), 'year'];
  const amount = `${value} ${unit}${value === 1 ? '' : 's'}`;
  // Foundation's numeric style treats zero as future: "in 0 seconds".
  return seconds < 0 ? `${amount} ago` : `in ${amount}`;
}

/** Foundation's `String.capitalized`: each word's first letter upper case, the rest lower case. */
function capitalized(value: string): string {
  return value
    .split(/(\s+)/)
    .map((word) => (word.trim() ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join('');
}

/** The connect button (ProfileView.swift:230). */
export function connectButtonTitle(connecting: boolean, connectionCount: number): string {
  if (connecting) return 'Connecting…';
  return connectionCount === 0 ? 'Connect Google Calendar' : 'Connect another calendar';
}

/** The Disconnect `confirmationDialog` (ProfileView.swift:273-284). */
export function disconnectTitle(connection: CalendarConnection | null): string {
  return `Disconnect ${connection ? displayName(connection) : 'this calendar'}?`;
}

export const DISCONNECT_MESSAGE = 'Events imported from this calendar are removed with the connection.';

/** `setCalendarWrites` (NexdoApp.swift:323). */
export function writesMessage(enabled: boolean): string {
  return enabled ? 'Nexdo can now add your scheduled tasks and events to this calendar.' : 'Nexdo will no longer add events to this calendar.';
}

/** `disconnectCalendar` (NexdoApp.swift:330). */
export const DISCONNECTED_MESSAGE = 'Calendar disconnected. Imported events were removed with the connection.';

/** The caption under the toggle while writes are off (ProfileView.swift:319). */
export const READ_ONLY_CAPTION = 'Read-only: events come into Nexdo, but tasks and events you create in Nexdo are not added to this calendar.';
