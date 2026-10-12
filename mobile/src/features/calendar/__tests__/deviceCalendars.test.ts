import * as Calendar from 'expo-calendar';

import { deviceCalendarEvents, deviceEventIdentifier, listDeviceCalendars, mapDeviceEvent, openDeviceEvent, requestDeviceCalendarAccess, sortDeviceCalendars, type DeviceCalendarRecord, type DeviceEventRecord } from '../deviceCalendars';

jest.mock('expo-calendar', () => ({
  EntityTypes: { EVENT: 'event' },
  EventStatus: { NONE: 'none', CONFIRMED: 'confirmed', TENTATIVE: 'tentative', CANCELED: 'canceled' },
  getCalendarPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true, granted: true })),
  requestCalendarPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true, granted: true })),
  getCalendarsAsync: jest.fn(async () => []),
  getEventsAsync: jest.fn(async () => []),
  openEventInCalendarAsync: jest.fn(async () => ({ action: 'done' })),
}));

const mocked = Calendar as jest.Mocked<typeof Calendar>;
const granted = { status: 'granted', canAskAgain: true, granted: true } as never;
const undetermined = { status: 'undetermined', canAskAgain: true, granted: false } as never;
const blocked = { status: 'denied', canAskAgain: false, granted: false } as never;

const CALENDARS = [
  { id: '3', title: 'Work', source: { name: 'work@example.com', type: 'caldav', id: 's2' }, color: '#000', allowsModifications: true, allowedAvailabilities: [] },
  { id: '1', title: 'Calendar', source: { name: 'Default', type: 'local', id: 's1' }, color: '#000', allowsModifications: true, allowedAvailabilities: [] },
  { id: '2', title: 'Birthdays', source: { name: 'Default', type: 'local', id: 's1' }, color: '#000', allowsModifications: true, allowedAvailabilities: [] },
] as unknown as DeviceCalendarRecord[];

function event(overrides: Partial<DeviceEventRecord>): DeviceEventRecord {
  return {
    id: 'ev1',
    calendarId: '1',
    title: 'Dussehra',
    location: null,
    timeZone: 'Asia/Kolkata',
    notes: '',
    startDate: '2026-10-20T00:00:00.000Z',
    endDate: '2026-10-21T00:00:00.000Z',
    allDay: true,
    status: 'confirmed',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getCalendarPermissionsAsync.mockResolvedValue(granted);
  mocked.requestCalendarPermissionsAsync.mockResolvedValue(granted);
  mocked.getCalendarsAsync.mockResolvedValue(CALENDARS as never);
  mocked.getEventsAsync.mockResolvedValue([] as never);
});

describe('requestDeviceCalendarAccess (AppleCalendarService.requestAccess)', () => {
  it('does not prompt when access is already granted or blocked', async () => {
    expect(await requestDeviceCalendarAccess()).toBe(true);
    mocked.getCalendarPermissionsAsync.mockResolvedValue(blocked);
    expect(await requestDeviceCalendarAccess()).toBe(false);
    expect(mocked.requestCalendarPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts only while the answer is undecided, and reports the outcome', async () => {
    mocked.getCalendarPermissionsAsync.mockResolvedValue(undetermined);
    mocked.requestCalendarPermissionsAsync.mockResolvedValue(blocked);
    expect(await requestDeviceCalendarAccess()).toBe(false);
    mocked.requestCalendarPermissionsAsync.mockResolvedValue(granted);
    expect(await requestDeviceCalendarAccess()).toBe(true);
    expect(mocked.requestCalendarPermissionsAsync).toHaveBeenCalledTimes(2);
  });
});

describe('listDeviceCalendars (calendars())', () => {
  it('sorts by account then title and names the account from the source', async () => {
    expect(await listDeviceCalendars()).toEqual([
      { id: '2', title: 'Birthdays', account: 'Default' },
      { id: '1', title: 'Calendar', account: 'Default' },
      { id: '3', title: 'Work', account: 'work@example.com' },
    ]);
  });

  it('is empty without access', async () => {
    mocked.getCalendarPermissionsAsync.mockResolvedValue(blocked);
    expect(await listDeviceCalendars()).toEqual([]);
    expect(mocked.getCalendarsAsync).not.toHaveBeenCalled();
  });

  it('sortDeviceCalendars leaves its input alone', () => {
    const input = [{ id: 'b', title: 'B', account: '' }, { id: 'a', title: 'A', account: '' }];
    expect(sortDeviceCalendars(input).map((c) => c.id)).toEqual(['a', 'b']);
    expect(input.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('deviceCalendarEvents (events(start:end:selectedIDs:))', () => {
  const start = Date.parse('2026-10-19T00:00:00.000Z');
  const end = Date.parse('2026-10-23T00:00:00.000Z');

  it('reads the chosen calendars, skips cancelled events, and dedupes occurrences', async () => {
    mocked.getEventsAsync.mockResolvedValue([
      event({}),
      event({ id: 'ev2', title: 'Cancelled', status: 'canceled' }),
      event({}),
      event({ id: 'ev3', title: '', calendarId: '2', allDay: false, startDate: '2026-10-20T04:30:00.000Z', endDate: '2026-10-20T05:00:00.000Z', notes: 'Bring cake', location: 'Home' }),
    ] as never);
    const events = await deviceCalendarEvents({ start, end, selectedIds: new Set(['1', '2']), phoneZone: 'Asia/Kolkata' });
    expect(mocked.getEventsAsync).toHaveBeenCalledWith(['1', '2'], new Date(start), new Date(end));
    expect(events.map((item) => item.title)).toEqual(['Dussehra', 'Untitled event']);
    expect(events[0]).toMatchObject({ id: 'apple-device:1:ev1:1792454400.0', source: 'apple-device', allDay: true, timeZone: 'Asia/Kolkata', notes: null, location: null, connectionId: null, completedAt: null });
    expect(events[1]).toMatchObject({ notes: 'Bring cake', location: 'Home', allDay: false, startAt: '2026-10-20T04:30:00Z', endAt: '2026-10-20T05:00:00Z' });
  });

  it('reads every calendar with no saved choice, and none with an empty one', async () => {
    await deviceCalendarEvents({ start, end, selectedIds: null });
    expect(mocked.getEventsAsync).toHaveBeenCalledWith(['3', '1', '2'], expect.any(Date), expect.any(Date));
    mocked.getEventsAsync.mockClear();
    expect(await deviceCalendarEvents({ start, end, selectedIds: new Set() })).toEqual([]);
    expect(mocked.getEventsAsync).not.toHaveBeenCalled();
  });

  it('reads nothing without access or with an empty range', async () => {
    expect(await deviceCalendarEvents({ start: end, end: start, selectedIds: null })).toEqual([]);
    mocked.getCalendarPermissionsAsync.mockResolvedValue(blocked);
    expect(await deviceCalendarEvents({ start, end, selectedIds: null })).toEqual([]);
    expect(mocked.getEventsAsync).not.toHaveBeenCalled();
  });

  it('keeps the phone zone for an event the module gives none for, and drops one with no instants', () => {
    expect(mapDeviceEvent(event({ timeZone: '' }), 'Europe/Paris')?.timeZone).toBe('Europe/Paris');
    expect(mapDeviceEvent(event({ startDate: 'not a date' }), 'Europe/Paris')).toBeNull();
    expect(mapDeviceEvent(event({ startDate: new Date('2026-10-20T00:00:00.000Z') }), 'Europe/Paris')?.startAt).toBe('2026-10-20T00:00:00Z');
  });
});

describe('opening a device event in the phone calendar', () => {
  it('unpacks the calendar and event identifiers from the composite id', () => {
    expect(deviceEventIdentifier('apple-device:12:345:1792454400.0')).toEqual({ calendarId: '12', identifier: '345' });
    expect(deviceEventIdentifier('apple-device:A1B:7F2E-33:1792454400.5')).toEqual({ calendarId: 'A1B', identifier: '7F2E-33' });
    expect(deviceEventIdentifier('moment:x:2026-10-20')).toBeNull();
    expect(deviceEventIdentifier('apple-device:only')).toBeNull();
  });

  it('opens the event through expo-calendar and reports a refusal', async () => {
    const ok = await openDeviceEvent({ id: 'apple-device:1:ev1:1792454400.0', source: 'apple-device', startAt: '2026-10-20T00:00:00Z' });
    expect(ok).toBe(true);
    expect(mocked.openEventInCalendarAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'ev1' }));
    expect(await openDeviceEvent({ id: 'e1', source: 'google', startAt: '2026-10-20T00:00:00Z' })).toBe(false);
    mocked.openEventInCalendarAsync.mockRejectedValueOnce(new Error('no app'));
    expect(await openDeviceEvent({ id: 'apple-device:1:ev1:1792454400.0', source: 'apple-device', startAt: '2026-10-20T00:00:00Z' })).toBe(false);
  });
});
