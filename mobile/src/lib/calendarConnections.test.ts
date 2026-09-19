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
    [null, null],
    ['2026-09-19T11:59:30.000Z', 'Synchronized 30 seconds ago'],
    ['2026-09-19T11:55:00.000Z', 'Synchronized 5 minutes ago'],
    ['2026-09-19T09:00:00.000Z', 'Synchronized 3 hours ago'],
    ['2026-09-17T12:00:00.000Z', 'Synchronized 2 days ago'],
    ['2026-09-05T12:00:00.000Z', 'Synchronized 2 weeks ago'],
    ['2026-06-19T12:00:00.000Z', 'Synchronized 3 months ago'],
  ])('describes a sync at %s as %s', (at, expected) => {
    expect(lastSyncedDescription({ ...base, lastSyncedAt: at }, NOW)).toBe(expected);
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
      expect(lastSyncedDescription({ ...base, lastSyncedAt: '2026-09-19T11:55:00.000Z' }, now)).toBe('Synchronized 5 minutes ago');
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
