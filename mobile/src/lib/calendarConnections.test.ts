import type { CalendarConnection } from '../api/types';
import { connectButtonTitle, connectionDetail, disconnectTitle, displayName, isHealthy, lastSyncedDescription, providerLabel } from './calendarConnections';

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
    expect(lastSyncedDescription({ ...base, lastSyncedAt: at }, NOW, 'en-US')).toBe(expected);
  });

  it('labels the connect button and the disconnect dialog', () => {
    expect(connectButtonTitle(false, 0)).toBe('Connect Google Calendar');
    expect(connectButtonTitle(false, 2)).toBe('Connect another calendar');
    expect(connectButtonTitle(true, 2)).toBe('Connecting…');
    expect(disconnectTitle(base)).toBe('Disconnect Work?');
    expect(disconnectTitle(null)).toBe('Disconnect this calendar?');
  });
});
