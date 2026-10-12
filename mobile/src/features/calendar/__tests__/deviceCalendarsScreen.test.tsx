import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Calendar from 'expo-calendar/legacy';
import { Linking, Platform } from 'react-native';

import { useSession } from '../../../store/session';
import { DeviceCalendarsScreen } from '../DeviceCalendarsScreen';
import { deviceCalendarSelection } from '../deviceCalendarSelection';

jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return { router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event' },
  EventStatus: { CANCELED: 'canceled' },
  getCalendarPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true, granted: true })),
  requestCalendarPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true, granted: true })),
  getCalendarsAsync: jest.fn(async () => []),
  getEventsAsync: jest.fn(async () => []),
}));

const mocked = Calendar as jest.Mocked<typeof Calendar>;
const granted = { status: 'granted', canAskAgain: true, granted: true } as never;
const undetermined = { status: 'undetermined', canAskAgain: true, granted: false } as never;
const blocked = { status: 'denied', canAskAgain: false, granted: false } as never;
const CALENDARS = [
  { id: '1', title: 'Calendar', source: { name: 'Default' } },
  { id: '2', title: 'Birthdays', source: { name: 'Other' } },
  { id: '3', title: 'India Holidays', source: { name: 'Subscribed Calendars' } },
] as never;

let platform: { replaceValue: (value: 'ios' | 'android') => void; restore: () => void };
afterEach(() => platform.restore());

beforeEach(() => {
  jest.clearAllMocks();
  platform = jest.replaceProperty(Platform, 'OS', 'android');
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'V', email: 'v@example.com', timeZone: 'Asia/Kolkata' } });
  deviceCalendarSelection.setState({ owner: null, selection: null, loaded: false, revision: 0 });
  mocked.getCalendarPermissionsAsync.mockResolvedValue(granted);
  mocked.requestCalendarPermissionsAsync.mockResolvedValue(granted);
  mocked.getCalendarsAsync.mockResolvedValue(CALENDARS);
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
});

async function show() {
  const onBack = jest.fn();
  const onImportMoments = jest.fn();
  await render(<DeviceCalendarsScreen onBack={onBack} onImportMoments={onImportMoments} />);
  await waitFor(() => expect(screen.getByTestId('device-calendars-bar')).toBeTruthy());
  await waitFor(() => expect(screen.queryByTestId('device-calendars-loading')).toBeNull());
  return { onBack, onImportMoments };
}

describe('Phone calendars (AppleCalendarSelectionView)', () => {
  it('lists every calendar on, with its account, when nothing has been chosen', async () => {
    await show();
    expect(screen.getByText('Phone calendars')).toBeTruthy();
    expect(screen.getByText('Selected calendars appear in NexDo’s Schedule, Week, and Month views on this phone. Events stay on this device. Edit them in Phone calendar.')).toBeTruthy();
    expect(screen.getByText('Calendars to show')).toBeTruthy();
    for (const id of ['1', '2', '3']) expect(screen.getByTestId(`device-calendar-toggle-${id}`).props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('device-calendar-account-3')).toHaveTextContent('Subscribed Calendars');
    expect(screen.queryByTestId('device-calendars-allow')).toBeNull();
    expect(screen.getByText('Import birthdays and anniversaries into Moments')).toBeTruthy();
  });

  it('saves a toggle for this account and shows the all-hidden line once none is on', async () => {
    await show();
    await act(async () => fireEvent.press(screen.getByTestId('device-calendar-toggle-2')));
    await waitFor(() => expect(deviceCalendarSelection.getState().selection).toEqual(['1', '3']));
    expect(screen.getByTestId('device-calendar-toggle-2').props.accessibilityState.checked).toBe(false);
    await act(async () => fireEvent.press(screen.getByTestId('device-calendar-toggle-1')));
    await act(async () => fireEvent.press(screen.getByTestId('device-calendar-toggle-3')));
    await waitFor(() => expect(screen.getByTestId('device-calendars-all-hidden')).toHaveTextContent('All calendars are hidden. Turn on a calendar to show its events.'));
    await act(async () => fireEvent.press(screen.getByTestId('device-calendar-toggle-1')));
    expect(deviceCalendarSelection.getState().selection).toEqual(['1']);
  });

  it('says so when the phone has no calendars', async () => {
    mocked.getCalendarsAsync.mockResolvedValue([]);
    await show();
    expect(screen.getByTestId('device-calendars-empty')).toHaveTextContent('No calendars are available on this phone. Add a calendar account in your phone’s Settings.');
  });

  it('offers to allow access, asks once, and shows the list after a grant', async () => {
    // Undecided until the prompt has been answered, granted after it.
    mocked.getCalendarPermissionsAsync.mockImplementation(async () => (mocked.requestCalendarPermissionsAsync.mock.calls.length ? granted : undetermined));
    await show();
    expect(screen.queryByTestId('device-calendars-list')).toBeNull();
    expect(screen.getByText('Allow calendar access')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('device-calendars-allow')));
    await waitFor(() => expect(screen.getByTestId('device-calendars-list')).toBeTruthy());
    expect(mocked.requestCalendarPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('device-calendars-failure')).toBeNull();
  });

  it('explains a refusal and opens Settings', async () => {
    mocked.getCalendarPermissionsAsync.mockResolvedValue(blocked);
    await show();
    await act(async () => fireEvent.press(screen.getByTestId('device-calendars-allow')));
    await waitFor(() => expect(screen.getByTestId('device-calendars-failure')).toHaveTextContent('Calendar access is needed to read events. Enable it in Settings.'));
    expect(mocked.requestCalendarPermissionsAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('device-calendars-settings'));
    expect(Linking.openSettings).toHaveBeenCalled();
  });

  it('routes Back', async () => {
    const { onBack } = await show();
    await act(async () => fireEvent.press(screen.getByTestId('device-calendars-bar-back')));
    expect(onBack).toHaveBeenCalled();
  });

  it('routes the Moments import', async () => {
    const { onImportMoments } = await show();
    await act(async () => fireEvent.press(screen.getByTestId('device-calendars-import')));
    expect(onImportMoments).toHaveBeenCalled();
  });

  it('keeps Swift’s words on iOS', async () => {
    platform.replaceValue('ios');
    await show();
    expect(screen.getByText('Apple Calendars')).toBeTruthy();
    expect(screen.getByText(/Edit them in Apple Calendar\./)).toBeTruthy();
  });
});
