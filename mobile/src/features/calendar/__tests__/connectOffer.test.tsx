import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { CalendarConnection, Profile } from '../../../api';
import { useSession } from '../../../store/session';

/** Focused while mounted; `mockRefocus()` blurs and focuses every screen again, like returning to the tab. */
const mockFocus = new Set<() => void>();
const mockRefocus = () => mockFocus.forEach((run) => run());
jest.mock('expo-router', () => {
  const { useEffect: useReactEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) =>
      useReactEffect(() => {
        let cleanup = effect();
        const run = () => {
          cleanup?.();
          cleanup = effect();
        };
        mockFocus.add(run);
        return () => {
          mockFocus.delete(run);
          cleanup?.();
        };
      }, [effect]),
  };
});

const mockConnections = jest.fn();
jest.mock('../../../api', () => ({
  ...jest.requireActual('../../../api'),
  endpoints: { calendarConnections: (...args: unknown[]) => mockConnections(...args) },
}));

const mockReadable = jest.fn();
jest.mock('../deviceCalendars', () => ({ hasDeviceCalendarAccess: () => mockReadable() }));

import { CALENDAR_OFFER_ANSWERED_PREFIX, offersCalendarConnection, useCalendarConnectOffer } from '../connectOffer';

/**
 * `offerCalendarConnection()` (ios/App/CalendarView.swift:263-277, fbce45b): only after a successful status
 * refresh, with no server connection and the phone's calendars unreadable, once per account per visit.
 */

const GOOGLE: CalendarConnection = { id: 'c1', provider: 'google', status: 'active', writeEnabled: true };
const profile = (id: string) => ({ id, name: 'Ada', email: 'a@b.c', timeZone: 'UTC' }) as Profile;

function Probe() {
  const offer = useCalendarConnectOffer();
  return (
    <Pressable accessibilityLabel="Not now" onPress={offer.close}>
      <Text>{offer.visible ? 'offer' : 'none'}</Text>
    </Pressable>
  );
}

const clients: QueryClient[] = [];
async function show(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(queryClient);
  const screen = await render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  return { ...screen, queryClient };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockConnections.mockReset().mockResolvedValue({ connections: [] });
  mockReadable.mockReset().mockResolvedValue(false);
  useSession.setState({ status: 'signedIn', profile: profile('u1') });
});
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe('offersCalendarConnection', () => {
  it('asks only with no connection and unreadable phone calendars', () => {
    expect(offersCalendarConnection([], false)).toBe(true);
    expect(offersCalendarConnection([GOOGLE], false)).toBe(false);
    expect(offersCalendarConnection([], true)).toBe(false);
    expect(offersCalendarConnection([GOOGLE], true)).toBe(false);
  });
});

describe('useCalendarConnectOffer', () => {
  it('shows after a successful refresh with nothing connected', async () => {
    const screen = await show(<Probe />);
    await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());
    expect(mockConnections).toHaveBeenCalledTimes(1);
  });

  it('refreshes even when a list is cached, and uses the fresh answer', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    clients.push(queryClient);
    queryClient.setQueryData(['calendar', 'connections'], []);
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mockConnections).toHaveBeenCalledTimes(1));
    expect(screen.getByText('none')).toBeTruthy();
  });

  it.each([
    ['a calendar is connected', () => mockConnections.mockResolvedValue({ connections: [GOOGLE] })],
    ['the phone calendars are readable', () => mockReadable.mockResolvedValue(true)],
    ['the refresh fails', () => mockConnections.mockRejectedValue(new Error('offline'))],
  ])('stays hidden when %s', async (_, arrange) => {
    arrange();
    const screen = await show(<Probe />);
    await waitFor(() => expect(mockConnections).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('stays hidden for a signed-out session, and asks nothing', async () => {
    useSession.setState({ status: 'signedOut', profile: null });
    const screen = await show(<Probe />);
    await act(async () => undefined);
    expect(screen.getByText('none')).toBeTruthy();
    expect(mockConnections).not.toHaveBeenCalled();
  });

  it('drops the answer if the account changed during the refresh', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockConnections.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    // u2 has Google connected, so only u1's stale empty answer could show the offer.
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    const screen = await show(<Probe />);
    await act(async () => {
      // A switch goes through sign-out, which clears the cache (useSignOut), so u2 refreshes on its own.
      screen.queryClient.clear();
      useSession.setState({ profile: profile('u2') });
    });
    await act(async () => finish({ connections: [] }));
    expect(mockConnections).toHaveBeenCalledTimes(2);
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('asks once per account while the tab stays mounted, even after Not now', async () => {
    const screen = await show(<Probe />);
    await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Not now'));
    expect(screen.getByText('none')).toBeTruthy();

    // A later visit to the tab: no second refresh, no second offer.
    await act(async () => mockRefocus());
    expect(screen.getByText('none')).toBeTruthy();
    expect(mockConnections).toHaveBeenCalledTimes(1);
  });

  it('asks the next account too', async () => {
    const screen = await show(<Probe />);
    await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Not now'));

    await act(async () => {
      useSession.setState({ profile: profile('u2') });
    });
    await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());
    expect(mockConnections).toHaveBeenCalledTimes(2);
  });
});

// Swift's task is cancelled when the view disappears; leaving the tab mid-refresh shows nothing, and the
// next visit asks again because the account was never marked as prompted.
it('asks again on the next visit if the tab lost focus mid-refresh', async () => {
  let finish: (value: unknown) => void = () => undefined;
  mockConnections.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  const screen = await show(<Probe />);
  await act(async () => {
    mockRefocus();
    finish({ connections: [] });
  });
  // The new visit's check (sharing the request still in flight) is the one that shows it.
  await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());
});

/**
 * ANDROID AHEAD (§24 Swift bug 14; docs/android-polish.md §57): an answer is remembered on this device for
 * that account, across launches. An offer nobody answered comes back. A relaunch is a fresh hook instance
 * (a new `key`) over the same device storage.
 */
describe('the offer after a relaunch', () => {
  const relaunch = async (screen: Awaited<ReturnType<typeof show>>, launch: string) => {
    await screen.rerender(
      <QueryClientProvider client={screen.queryClient}>
        <Probe key={launch} />
      </QueryClientProvider>,
    );
  };

  it('never comes back for an account that answered it, and asks nothing', async () => {
    const screen = await show(<Probe key="first" />);
    await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Not now'));
    await waitFor(async () => expect(await AsyncStorage.getItem(`${CALENDAR_OFFER_ANSWERED_PREFIX}u1`)).toBe('true'));
    mockConnections.mockClear();

    await relaunch(screen, 'second');
    await act(async () => undefined);
    expect(screen.getByText('none')).toBeTruthy();
    expect(mockConnections).not.toHaveBeenCalled();
  });

  it('comes back after a relaunch if nobody answered it', async () => {
    const screen = await show(<Probe key="first" />);
    await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());

    await relaunch(screen, 'second');
    await waitFor(() => expect(mockConnections).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());
  });

  it('is remembered per account', async () => {
    await AsyncStorage.setItem(`${CALENDAR_OFFER_ANSWERED_PREFIX}u2`, 'true');
    const screen = await show(<Probe />);
    await waitFor(() => expect(screen.getByText('offer')).toBeTruthy());
  });
});
