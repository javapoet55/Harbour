import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Calendar from 'expo-calendar';
import { Linking, Platform } from 'react-native';

import { useSession } from '../../../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
    useNavigation: () => ({ setOptions: jest.fn(), getParent: () => ({ setOptions: jest.fn() }) }),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    useIsFocused: () => true,
  };
});
jest.mock('expo-calendar', () => ({
  EntityTypes: { EVENT: 'event' },
  EventStatus: { CANCELED: 'canceled' },
  getCalendarPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', canAskAgain: true, granted: false })),
  requestCalendarPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true, granted: true })),
  getCalendarsAsync: jest.fn(async () => []),
  getEventsAsync: jest.fn(async () => []),
}));
const mockOpenAuthSession = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
  dismissAuthSession: jest.fn(),
}));
jest.mock('../../../config', () => ({ getApiUrl: () => 'https://api.example.com' }));
const mockConnections = jest.fn();
const mockConnectToken = jest.fn();
const mockMe = jest.fn();
jest.mock('../../../api', () => ({
  ...jest.requireActual('../../../api'),
  endpoints: {
    me: (...args: unknown[]) => mockMe(...args),
    calendarConnections: (...args: unknown[]) => mockConnections(...args),
    calendarConnectToken: (...args: unknown[]) => mockConnectToken(...args),
  },
}));

import { CalendarConnectHub } from '../CalendarConnectHub';
import { CalendarProviderScreen } from '../CalendarProviderScreen';
import { CONNECT_ART_RECTS } from '../connectArt';
import { providerPageCopy, providerTitle } from '../calendarProviders';
import { calendarProviderLabel } from '../../../components/CalendarProviderIcon';

const mocked = Calendar as jest.Mocked<typeof Calendar>;
const granted = { status: 'granted', canAskAgain: true, granted: true } as never;
const undetermined = { status: 'undetermined', canAskAgain: true, granted: false } as never;
const blocked = { status: 'denied', canAskAgain: false, granted: false } as never;

const GOOGLE = { id: 'c1', provider: 'google', status: 'CONNECTED', accountEmail: 'visakan@apzzo.com', calendarName: null, writeEnabled: true, lastSyncedAt: '2026-09-21T09:58:00.000Z' };
const STALE = { ...GOOGLE, id: 'c2', provider: 'microsoft', status: 'NEEDS_REAUTH', accountEmail: 'v@outlook.com' };

let platform: { replaceValue: (value: 'ios' | 'android') => void; restore: () => void };
const clients: QueryClient[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  platform = jest.replaceProperty(Platform, 'OS', 'android');
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'V', email: 'v@example.com', timeZone: 'Asia/Kolkata' } });
  mockConnections.mockResolvedValue({ connections: [] });
  mockConnectToken.mockResolvedValue({ token: 'one-time-token' });
  mockMe.mockResolvedValue({ user: { id: 'u1', name: 'V', email: 'v@example.com', timeZone: 'Asia/Kolkata', photo: null, preference: null, nextAction: null } });
  mocked.getCalendarPermissionsAsync.mockResolvedValue(undetermined);
  mocked.requestCalendarPermissionsAsync.mockResolvedValue(granted);
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => {
  platform.restore();
  clients.splice(0).forEach((client) => client.clear());
});

async function show(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  clients.push(queryClient);
  await render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  return queryClient;
}

async function showHub() {
  const onBack = jest.fn();
  const onProvider = jest.fn();
  await show(<CalendarConnectHub onBack={onBack} onProvider={onProvider} />);
  await waitFor(() => expect(mockConnections).toHaveBeenCalled());
  return { onBack, onProvider };
}

async function showProvider(provider: 'google' | 'apple' | 'microsoft') {
  const onBack = jest.fn();
  const onHelp = jest.fn();
  const onChooseCalendars = jest.fn();
  const queryClient = await show(<CalendarProviderScreen onBack={onBack} onChooseCalendars={onChooseCalendars} onHelp={onHelp} provider={provider} />);
  await waitFor(() => expect(mockConnections).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId(`calendar-connect-${provider}`)).toBeTruthy());
  return { onBack, onHelp, onChooseCalendars, queryClient };
}

describe('Connect Your Calendar hub (CalendarConnectionView.swift:5-73)', () => {
  it('lists Google, Phone calendar and Microsoft in Swift’s order with the Android captions', async () => {
    await showHub();
    expect(screen.getByText('Connect Your Calendar')).toBeTruthy();
    expect(screen.getByText('Keep your events, reminders, and important moments together in NexDo.')).toBeTruthy();
    const cards = screen.getAllByTestId(/^calendar-provider-(google|apple|microsoft)$/).map((node) => node.props.testID);
    expect(cards).toEqual(['calendar-provider-google', 'calendar-provider-apple', 'calendar-provider-microsoft']);
    expect(screen.getByText('Google Calendar')).toBeTruthy();
    expect(screen.getByText('Connect your Google account')).toBeTruthy();
    expect(screen.getByText('Phone calendar')).toBeTruthy();
    expect(screen.getByText('Connect your phone’s calendars')).toBeTruthy();
    expect(screen.getByText('Microsoft Calendar')).toBeTruthy();
    expect(screen.getByText('Connect your Microsoft account')).toBeTruthy();
    expect(screen.queryByText('Apple Calendar')).toBeNull();
    expect(screen.getByText('Your data stays private')).toBeTruthy();
    expect(screen.getByText('We only access the calendar information you allow. You can disconnect anytime.')).toBeTruthy();
    expect(screen.queryByTestId('calendar-provider-google-connected')).toBeNull();
  });

  it('keeps Swift’s Apple Calendar wording on iOS', async () => {
    platform.replaceValue('ios');
    await showHub();
    expect(screen.getByText('Apple Calendar')).toBeTruthy();
    expect(screen.getByText('Connect your iPhone calendars')).toBeTruthy();
  });

  it('marks a healthy connection Connected, a stale one Needs reconnecting, and the phone when access is allowed', async () => {
    mockConnections.mockResolvedValue({ connections: [GOOGLE, STALE] });
    mocked.getCalendarPermissionsAsync.mockResolvedValue(granted);
    await showHub();
    await waitFor(() => expect(screen.getByTestId('calendar-provider-google-connected')).toHaveTextContent('Connected'));
    expect(screen.getByTestId('calendar-provider-microsoft-reconnect')).toHaveTextContent('Needs reconnecting');
    await waitFor(() => expect(screen.getByTestId('calendar-provider-apple-connected')).toHaveTextContent('Connected'));
  });

  it('opens the provider page from its card and goes back from the chevron', async () => {
    const { onBack, onProvider } = await showHub();
    await act(async () => fireEvent.press(screen.getByTestId('calendar-provider-microsoft')));
    expect(onProvider).toHaveBeenCalledWith('microsoft');
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-hub-back')));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows the connection-list error with Retry connection status, which reloads', async () => {
    mockConnections.mockRejectedValueOnce(new Error('offline'));
    await showHub();
    await waitFor(() => expect(screen.getByTestId('calendar-connect-hub-error')).toHaveTextContent('Could not refresh calendar connections. Please try again.'));
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-hub-retry')));
    await waitFor(() => expect(screen.getByTestId('calendar-provider-google-connected')).toBeTruthy());
    expect(screen.queryByTestId('calendar-connect-hub-error')).toBeNull();
  });
});

describe('Provider page (CalendarProviderConnectionView, :86-277)', () => {
  it('Google: the title, subtitle, three steps, privacy label, Connect Now and Learn more', async () => {
    const { onHelp } = await showProvider('google');
    expect(screen.getByText('Connect Google Calendar')).toBeTruthy();
    expect(screen.getByText('Connect your Google Calendar to organize your schedule and important events.')).toBeTruthy();
    expect(screen.getByText('Sign in to Google')).toBeTruthy();
    expect(screen.getByText('Tap Connect Now and choose the Google account you want to use.')).toBeTruthy();
    expect(screen.getByText('Review permissions')).toBeTruthy();
    expect(screen.getByText('Your provider requests access to read and manage events. NexDo can add your scheduled tasks and events. You can turn this off in Calendars & Privacy.')).toBeTruthy();
    expect(screen.getByText('You’re all set!')).toBeTruthy();
    expect(screen.getByText('You control access. Disconnect this calendar in NexDo Settings at any time.')).toBeTruthy();
    expect(screen.getByTestId('calendar-connect-google')).toHaveTextContent('Connect Now');
    expect(screen.getByTestId('calendar-connect-progress').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 30 })]));
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-help')));
    expect(onHelp).toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-learn-more')));
    expect(Linking.openURL).toHaveBeenCalledWith('https://nexdoapp.com/privacy');
  });

  it('Microsoft: the same page for the other OAuth provider, built from the source', async () => {
    await showProvider('microsoft');
    expect(screen.getByText('Connect Microsoft Calendar')).toBeTruthy();
    expect(screen.getByText('Sign in to Microsoft')).toBeTruthy();
    expect(screen.getByText('Tap Connect Now and choose the Microsoft account you want to use.')).toBeTruthy();
    expect(screen.queryByTestId('calendar-connect-open-settings')).toBeNull();
  });

  it('Google: Connect Now fetches a token for THIS provider, opens the start URL, then shows the connected state', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'nexdo://calendar-connected?calendar=google-connected' });
    mockConnections.mockResolvedValueOnce({ connections: [] }).mockResolvedValue({ connections: [GOOGLE] });
    await showProvider('google');
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-google')));
    await waitFor(() => expect(screen.getByTestId('calendar-connect-success')).toHaveTextContent('Google Calendar connected.'));
    expect(mockConnectToken).toHaveBeenCalledWith('google');
    expect(mockOpenAuthSession.mock.calls[0][0]).toBe('https://api.example.com/api/calendar/oauth/google/start?native=1&connect_token=one-time-token');
    expect(screen.getByText('This provider is already connected. Manage accounts in Calendars & Privacy.')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('calendar-connect-account-c1')).toHaveTextContent('visakan@apzzo.comLast synced Sep 21 at 2:58 AM'));
    expect(screen.getByTestId('calendar-connect-google')).toHaveTextContent('Done');
    expect(screen.getByTestId('calendar-connect-another')).toBeTruthy();
    expect(screen.getByTestId('calendar-connect-progress').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 100 })]));
  });

  it('Microsoft: the token and start URL name microsoft, and the callback must confirm microsoft', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'nexdo://calendar-connected?calendar=google-connected' });
    await showProvider('microsoft');
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-microsoft')));
    await waitFor(() => expect(screen.getByTestId('calendar-connect-error')).toHaveTextContent('Calendar connection was not confirmed. Please try again.'));
    expect(mockConnectToken).toHaveBeenCalledWith('microsoft');
    expect(mockOpenAuthSession.mock.calls[0][0]).toBe('https://api.example.com/api/calendar/oauth/microsoft/start?native=1&connect_token=one-time-token');
  });

  it('a closed browser says the existing calendars are unchanged; a detail is a failure naming the provider', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    await showProvider('microsoft');
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-microsoft')));
    await waitFor(() => expect(screen.getByTestId('calendar-connect-status')).toHaveTextContent('Connection cancelled. Your existing calendars are unchanged.'));
    expect(screen.getByTestId('calendar-connect-microsoft')).toHaveTextContent('Connect Now');

    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'nexdo://calendar-connected?calendar=error&detail=access_denied' });
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-microsoft')));
    await waitFor(() => expect(screen.getByTestId('calendar-connect-error')).toHaveTextContent('Microsoft Calendar connection failed: access_denied'));
    expect(screen.queryByTestId('calendar-connect-status')).toBeNull();
  });

  it('says the status could not be loaded when the list fails to reload after connecting', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'nexdo://calendar-connected?calendar=google-connected' });
    mockConnections.mockResolvedValueOnce({ connections: [] }).mockRejectedValue(new Error('offline'));
    await showProvider('google');
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-google')));
    await waitFor(() => expect(screen.getByTestId('calendar-connect-status')).toHaveTextContent('Calendar connected, but its latest status could not be loaded. Retry from Calendars & Privacy.'));
    expect(screen.getByTestId('calendar-connect-success')).toBeTruthy();
  });

  it('shows Connecting… with Cancel in the toolbar and no back; Cancel says so and restores Connect Now', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockOpenAuthSession.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await showProvider('google');
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-google')));
    await waitFor(() => expect(screen.getByTestId('calendar-connect-google')).toHaveTextContent('Connecting…'));
    expect(screen.queryByTestId('calendar-provider-page-back')).toBeNull();
    expect(screen.queryByTestId('calendar-connect-help')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-cancel')));
    expect(screen.getByTestId('calendar-connect-status')).toHaveTextContent('Connection cancelled.');
    expect(screen.getByTestId('calendar-connect-google')).toHaveTextContent('Connect Now');
    expect(screen.getByTestId('calendar-provider-page-back')).toBeTruthy();
    // The late answer is ignored.
    await act(async () => {
      finish({ type: 'success', url: 'nexdo://calendar-connected?calendar=google-connected' });
    });
    expect(screen.queryByTestId('calendar-connect-success')).toBeNull();
  });

  it('Done on a connected page goes back; Connect another account starts the flow again', async () => {
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    const { onBack } = await showProvider('google');
    await waitFor(() => expect(screen.getByTestId('calendar-connect-google')).toHaveTextContent('Done'));
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-google')));
    expect(onBack).toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-another')));
    await waitFor(() => expect(mockOpenAuthSession).toHaveBeenCalled());
  });

  it('Phone calendar (Android): the §33 wording, Allow access badge, black button, Connect Now requests the permission and opens the list', async () => {
    const { onChooseCalendars } = await showProvider('apple');
    expect(screen.getByText('Connect Phone calendar')).toBeTruthy();
    expect(screen.getByText('Show events from calendars already added to your phone alongside your NexDo plans.')).toBeTruthy();
    expect(screen.getByText('Use your Phone calendar')).toBeTruthy();
    expect(screen.getByText('Allow calendar access when Android asks. NexDo reads your selected calendars to display their events. It does not edit those events.')).toBeTruthy();
    expect(screen.getByText('Choose calendars')).toBeTruthy();
    expect(screen.getByText('Allow access', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Calendar reading happens on this device. Change access in Settings.')).toBeTruthy();
    expect(screen.queryByText(/iPhone/)).toBeNull();
    expect(screen.getByTestId('calendar-connect-apple').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#000000' })]));

    // The system prompt grants: the next status read says so.
    mocked.requestCalendarPermissionsAsync.mockImplementation(async () => {
      mocked.getCalendarPermissionsAsync.mockResolvedValue(granted);
      return granted;
    });
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-apple')));
    await waitFor(() => expect(onChooseCalendars).toHaveBeenCalled());
    expect(mocked.requestCalendarPermissionsAsync).toHaveBeenCalled();
    expect(mockConnectToken).not.toHaveBeenCalled();
    expect(screen.getByTestId('calendar-connect-status')).toHaveTextContent('Calendar access allowed. Choose calendars to display in NexDo.');
    await waitFor(() => expect(screen.getByTestId('calendar-connect-success')).toHaveTextContent('Phone calendar connected.'));
    expect(screen.getByText('Calendar access is allowed on this phone. Choose which calendars appear in NexDo.')).toBeTruthy();
    expect(screen.getByTestId('calendar-connect-apple')).toHaveTextContent('Choose calendars');
    expect(screen.queryByTestId('calendar-connect-another')).toBeNull();
  });

  it('Phone calendar: a refused permission reports it and offers Open Settings once denied', async () => {
    mocked.requestCalendarPermissionsAsync.mockResolvedValue(blocked);
    mocked.getCalendarPermissionsAsync.mockResolvedValueOnce(undetermined).mockResolvedValue(blocked);
    const { onChooseCalendars } = await showProvider('apple');
    expect(screen.queryByTestId('calendar-connect-open-settings')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-apple')));
    await waitFor(() => expect(screen.getByTestId('calendar-connect-error')).toHaveTextContent('Calendar access is needed to display events. Enable it for NexDo in Settings.'));
    expect(onChooseCalendars).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('calendar-connect-open-settings')).toHaveTextContent('Open Settings'));
    await act(async () => fireEvent.press(screen.getByTestId('calendar-connect-open-settings')));
    expect(Linking.openSettings).toHaveBeenCalled();
  });

  it('Phone calendar on iOS keeps Swift’s strings', () => {
    const copy = providerPageCopy('apple', 'ios');
    expect(copy.title).toBe('Connect Apple Calendar');
    expect(copy.steps[0].detail).toBe('Add your iCloud account in iPhone Settings if it isn’t already there. No Apple password is entered in NexDo.');
    expect(copy.privacy).toBe('Calendar reading happens on this device. Change access in iPhone Settings.');
    expect(copy.accessNeeded).toBe('Full Calendar access is needed to display events. Enable it for NexDo in iPhone Settings.');
    expect(copy.openSettings).toBe('Open iPhone Settings');
    expect(providerTitle('apple', 'ios')).toBe('Apple Calendar');
    expect(providerTitle('apple', 'android')).toBe('Phone calendar');
  });
});

describe('Provider icon and artwork (CalendarConnectionView.swift:289-357)', () => {
  it('labels the icon from the recorded source, with the §33 label for device events on Android', () => {
    expect(calendarProviderLabel('apple-device')).toBe('Phone calendar');
    expect(calendarProviderLabel('iCloud')).toBe('Phone calendar');
    expect(calendarProviderLabel('outlook')).toBe('Outlook Calendar');
    expect(calendarProviderLabel('google')).toBe('Google Calendar');
    expect(calendarProviderLabel('harbor')).toBe('NexDo Calendar');
    expect(calendarProviderLabel(null)).toBe('Calendar');
    platform.replaceValue('ios');
    expect(calendarProviderLabel('apple-device')).toBe('Apple Calendar');
  });

  it('cuts the nine regions at Swift’s rectangles', () => {
    expect(CONNECT_ART_RECTS.google).toEqual([72, 82, 322, 318]);
    expect(CONNECT_ART_RECTS.hero).toEqual([24, 443, 401, 392]);
    expect(CONNECT_ART_RECTS.complete).toEqual([830, 856, 389, 350]);
    expect(Object.keys(CONNECT_ART_RECTS)).toHaveLength(9);
  });
});

/**
 * Phone parity pass 4: plain buttons take the app tint. (The transparent content layer over the gradient
 * is checked on the phone: the safe-area mock does not forward a style to test.)
 */
describe('the Connect surface on the phone', () => {
  it('draws Need help? in the app tint, not system blue', async () => {
    await showProvider('google');
    const { StyleSheet } = jest.requireActual('react-native') as typeof import('react-native');
    expect(StyleSheet.flatten(screen.getByText('Need help?').props.style).color).toBe('#3D29F0');
  });
});
