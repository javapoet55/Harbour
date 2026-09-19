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
 * `lastSyncedDescription` (`:60-65`): "Synchronized " + `RelativeDateTimeFormatter` in `.full` style,
 * which names the largest non-zero unit — "5 minutes ago", "2 days ago", "in 0 seconds" for now.
 */
export function lastSyncedDescription(connection: CalendarConnection, now: number = Date.now(), locale?: string): string | null {
  if (!connection.lastSyncedAt) return null;
  const at = Date.parse(connection.lastSyncedAt);
  if (Number.isNaN(at)) return null;
  return `Synchronized ${relativeTime(at, now, locale)}`;
}

function relativeTime(at: number, now: number, locale?: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' });
  const seconds = Math.trunc((at - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(seconds, 'second');
  if (abs < 3_600) return format.format(Math.trunc(seconds / 60), 'minute');
  if (abs < 86_400) return format.format(Math.trunc(seconds / 3_600), 'hour');
  const days = Math.trunc(seconds / 86_400);
  if (Math.abs(days) < 7) return format.format(days, 'day');
  if (Math.abs(days) < 30) return format.format(Math.trunc(days / 7), 'week');
  if (Math.abs(days) < 365) return format.format(Math.trunc(days / 30), 'month');
  return format.format(Math.trunc(days / 365), 'year');
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
