import type { CalendarConnection } from '../api/types';
import { connectButtonTitle, connectionDetail, disconnectTitle, displayName, isHealthy, lastSyncedDescription, providerLabel, relativeTime } from './calendarConnections';

/** `CalendarConnection` presentation (ios/Sources/NexdoCore/ProfileSettings.swift:41-74). */
const NOW = Date.parse('2026-09-19T12:00:00.000Z');
const base: CalendarConnection = { id: 'c', provider: 'google', accountEmail: 'a@b.com', calendarName: 'Work', status: 'connected', lastSyncedAt: null, writeEnabled: false };

describe('calendar connection presentation', () => {
  it('names the provider, and falls back to the name then the account', () => {
    expect(providerLabel({ ...base, provider: 'microsoft' })).toBe('Outlook Calendar');
    expect(providerLabel({ ...base, provider: 'icloud' })).toBe('Icloud');
    expect(displayName(base)).toBe('Work');
    expect(displayName({ ...base, calendarName: '' })).toBe('a@b.com');
    expect(displayName({ ...base, calendarName: null, accountEmail: null })).toBe('Google Calendar');
  });

  it('is healthy only when ACTIVE or CONNECTED, in any case', () => {
    expect(isHealthy({ ...base, status: 'ACTIVE' })).toBe(true);
    expect(isHealthy({ ...base, status: 'Connected' })).toBe(true);
    expect(isHealthy({ ...base, status: 'needs reauth' })).toBe(false);
  });

  it('builds the detail line', () => {
    expect(connectionDetail(base)).toBe('Google Calendar · a@b.com');
    expect(connectionDetail({ ...base, calendarName: null })).toBe('Google Calendar');
    expect(connectionDetail({ ...base, status: 'NEEDS REAUTH' })).toBe('Google Calendar · a@b.com · Needs Reauth');
  });

  it.each([
    ['2026-09-19T11:59:30.000Z', 'Last synced just now'],
    ['2026-09-19T11:59:01.000Z', 'Last synced just now'],
    ['2026-09-19T11:59:00.000Z', 'Last synced 1 min ago'],
    ['2026-09-19T11:55:00.000Z', 'Last synced 5 min ago'],
    ['2026-09-19T11:01:00.000Z', 'Last synced 59 min ago'],
    ['2026-09-19T11:00:00.000Z', 'Last synced today at 11:00 AM'],
    ['2026-09-19T00:05:00.000Z', 'Last synced today at 12:05 AM'],
    ['2026-09-18T15:05:00.000Z', 'Last synced yesterday at 3:05 PM'],
    ['2026-09-17T15:05:00.000Z', 'Last synced Sep 17 at 3:05 PM'],
    ['2025-12-31T23:30:00.000Z', 'Last synced Dec 31 at 11:30 PM'],
  ])('describes a sync at %s as %s', (at, expected) => {
    expect(lastSyncedDescription({ ...base, lastSyncedAt: at }, NOW, 'UTC')).toBe(expected);
  });

  it('says "Not synced yet" for a connection that has never synced', () => {
    expect(lastSyncedDescription({ ...base, lastSyncedAt: null }, NOW, 'UTC')).toBe('Not synced yet');
    expect(lastSyncedDescription({ ...base, lastSyncedAt: undefined }, NOW, 'UTC')).toBe('Not synced yet');
    expect(lastSyncedDescription({ ...base, lastSyncedAt: '' }, NOW, 'UTC')).toBe('Not synced yet');
    expect(lastSyncedDescription({ ...base, lastSyncedAt: 'not a date' }, NOW, 'UTC')).toBe('Not synced yet');
  });

  it('parses a server timestamp with and without fractional seconds', () => {
    expect(lastSyncedDescription({ ...base, lastSyncedAt: '2026-09-19T11:55:00.000Z' }, NOW, 'UTC')).toBe('Last synced 5 min ago');
    expect(lastSyncedDescription({ ...base, lastSyncedAt: '2026-09-19T11:55:00Z' }, NOW, 'UTC')).toBe('Last synced 5 min ago');
    // Fractional seconds count: these are 5m00.877s and 4m59.877s ago, and minutes are floored.
    expect(lastSyncedDescription({ ...base, lastSyncedAt: '2026-09-19T11:54:59.123456Z' }, NOW, 'UTC')).toBe('Last synced 5 min ago');
    expect(lastSyncedDescription({ ...base, lastSyncedAt: '2026-09-19T11:55:00.123456Z' }, NOW, 'UTC')).toBe('Last synced 4 min ago');
    expect(lastSyncedDescription({ ...base, lastSyncedAt: '2026-09-19T17:25:00.000+05:30' }, NOW, 'UTC')).toBe('Last synced 5 min ago');
  });

  it('says "Needs reconnecting" for any status but connected, ahead of the timestamp', () => {
    const at = '2026-09-19T11:55:00.000Z';
    expect(lastSyncedDescription({ ...base, status: 'error', lastSyncedAt: at }, NOW, 'UTC')).toBe('Needs reconnecting');
    expect(lastSyncedDescription({ ...base, status: 'needs reauth', lastSyncedAt: null }, NOW, 'UTC')).toBe('Needs reconnecting');
    // Swift compares `status.lowercased() != "connected"`, so ACTIVE needs reconnecting here even
    // though `isHealthy`, which draws the row's icon, still counts it as healthy.
    expect(lastSyncedDescription({ ...base, status: 'ACTIVE', lastSyncedAt: at }, NOW, 'UTC')).toBe('Needs reconnecting');
    expect(isHealthy({ ...base, status: 'ACTIVE' })).toBe(true);
  });

  it('accepts "connected" in any case', () => {
    const at = '2026-09-19T11:55:00.000Z';
    expect(lastSyncedDescription({ ...base, status: 'CONNECTED', lastSyncedAt: at }, NOW, 'UTC')).toBe('Last synced 5 min ago');
    expect(lastSyncedDescription({ ...base, status: 'Connected', lastSyncedAt: at }, NOW, 'UTC')).toBe('Last synced 5 min ago');
  });

  it('reads the clock in the account zone, not UTC', () => {
    const at = '2026-09-19T11:00:00.000Z';
    expect(lastSyncedDescription({ ...base, lastSyncedAt: at }, NOW, 'Asia/Kolkata')).toBe('Last synced today at 4:30 PM');
    // 11:00Z on the 19th is still the 18th in Los Angeles, where "now" is also the 19th’s small hours.
    expect(lastSyncedDescription({ ...base, lastSyncedAt: at }, NOW, 'America/Los_Angeles')).toBe('Last synced today at 4:00 AM');
  });

  it('treats a server clock ahead of the phone as the present', () => {
    expect(lastSyncedDescription({ ...base, lastSyncedAt: '2026-09-19T12:05:00.000Z' }, NOW, 'UTC')).toBe('Last synced just now');
  });

  it('labels the connect button and the disconnect dialog', () => {
    expect(connectButtonTitle(false, 0)).toBe('Connect Google Calendar');
    expect(connectButtonTitle(false, 2)).toBe('Connect another calendar');
    expect(connectButtonTitle(true, 2)).toBe('Connecting…');
    expect(disconnectTitle(base)).toBe('Disconnect Work?');
    expect(disconnectTitle(null)).toBe('Disconnect this calendar?');
  });
});

describe('relativeTime without Intl.RelativeTimeFormat (Hermes has none)', () => {
  const now = Date.parse('2026-09-19T12:00:00.000Z');
  const ago = (seconds: number) => relativeTime(now - seconds * 1000, now);

  it('does not touch Intl.RelativeTimeFormat', () => {
    const original = Intl.RelativeTimeFormat;
    // Simulate Hermes: the constructor does not exist.
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = undefined;
    try {
      expect(lastSyncedDescription({ ...base, lastSyncedAt: '2026-09-19T11:55:00.000Z' }, now, 'UTC')).toBe('Last synced 5 min ago');
    } finally {
      (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = original;
    }
  });

  it('matches RelativeDateTimeFormatter(.full, .numeric) for each unit, singular and plural', () => {
    expect(ago(0)).toBe('in 0 seconds');
    expect(ago(1)).toBe('1 second ago');
    expect(ago(59)).toBe('59 seconds ago');
    expect(ago(60)).toBe('1 minute ago');
    expect(ago(119)).toBe('1 minute ago');
    expect(ago(3_599)).toBe('59 minutes ago');
    expect(ago(3_600)).toBe('1 hour ago');
    expect(ago(86_399)).toBe('23 hours ago');
    expect(ago(86_400)).toBe('1 day ago');
    expect(ago(6 * 86_400)).toBe('6 days ago');
    expect(ago(7 * 86_400)).toBe('1 week ago');
  });

  it('says "in …" for a sync stamped slightly ahead of the phone’s clock', () => {
    expect(relativeTime(now + 5 * 60_000, now)).toBe('in 5 minutes');
    expect(relativeTime(now + 1_000, now)).toBe('in 1 second');
  });

  it('matches what Intl.RelativeTimeFormat produced in Node, where it exists', () => {
    const format = new Intl.RelativeTimeFormat('en-US', { numeric: 'always', style: 'long' });
    expect(ago(30)).toBe(format.format(-30, 'second'));
    expect(ago(5 * 3_600)).toBe(format.format(-5, 'hour'));
    expect(ago(2 * 86_400)).toBe(format.format(-2, 'day'));
    expect(relativeTime(now, now)).toBe(format.format(0, 'second'));
  });
});
