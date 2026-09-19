import type { CalendarConnection } from '../api/types';

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
 * `lastSyncedDescription` (`:60-65`): "Synchronized " + `RelativeDateTimeFormatter` with
 * `unitsStyle = .full` and the default `dateTimeStyle = .numeric`, which names the largest non-zero
 * unit — "30 seconds ago", "1 minute ago", "3 hours ago", "2 days ago" — and, being numeric, says
 * "in 0 seconds" (not "now") for the present and "in 5 minutes" for a timestamp slightly ahead of the
 * phone's clock.
 */
export function lastSyncedDescription(connection: CalendarConnection, now: number = Date.now()): string | null {
  if (!connection.lastSyncedAt) return null;
  const at = Date.parse(connection.lastSyncedAt);
  if (Number.isNaN(at)) return null;
  return `Synchronized ${relativeTime(at, now)}`;
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
  return enabled ? 'Nexdo can now add your scheduled tasks to this calendar.' : 'Nexdo will no longer add events to this calendar.';
}

/** `disconnectCalendar` (NexdoApp.swift:330). */
export const DISCONNECTED_MESSAGE = 'Calendar disconnected. Imported events were removed with the connection.';

/** The caption under the toggle while writes are off (ProfileView.swift:319). */
export const READ_ONLY_CAPTION = 'Read-only: events come into Nexdo, but tasks you schedule are not added to this calendar.';
