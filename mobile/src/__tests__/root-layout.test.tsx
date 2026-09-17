import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import type { NexdoTask } from '../api';
import { useCoordinator } from '../actions/coordinator';
import { createApiClient } from '../api/client';
import { queryKeys } from '../query/keys';
import { useSession } from '../store/session';

const mockCanDismiss = jest.fn(() => false);
const mockDismissAll = jest.fn();
// `Screen` renders a marker and `Protected` honours its guard, so which group is mounted — and when
// it stops being mounted — is assertable from the tree.
jest.mock('expo-router', () => {
  const { View } = require('react-native') as typeof import('react-native');
  function Stack({ children }: { children?: React.ReactNode }) {
    return <View>{children}</View>;
  }
  function Screen({ name }: { name: string }) {
    return <View testID={`screen-${name}`} />;
  }
  function Protected({ children, guard }: { children?: React.ReactNode; guard: boolean }) {
    return guard ? <View>{children}</View> : null;
  }
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return {
    Stack,
    router: {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canDismiss: () => mockCanDismiss(),
      dismissAll: () => mockDismissAll(),
    },
    useLocalSearchParams: () => ({}),
  };
});

// The notification wiring has its own suite; here it would only add listeners.
jest.mock('../actions/useActionNotifications', () => ({ useActionNotifications: () => undefined }));

const mockMe = jest.fn();
const mockTasks = jest.fn();
// `onSignedOut` is captured rather than stubbed: the tests below fire the handler the gate itself
// installs, through a real client answering 401.
const mockOnSignedOut = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  onSignedOut: (handler: () => void) => mockOnSignedOut(handler),
  endpoints: {
    me: (...args: unknown[]) => mockMe(...args),
    tasks: (...args: unknown[]) => mockTasks(...args),
  },
}));

const fileStore = (jest.requireMock('expo-file-system') as { __store: Map<string, string> }).__store;

import { RootNavigator } from '../../app/_layout';

const ZONE = 'Asia/Kolkata';
const PROFILE = { id: 'u1', name: 'Ada Lovelace', email: 'a@b.c', timeZone: ZONE };

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'Contact Damien at 10 AM', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

/**
 * A client with NO default `queryFn`, which is what the app itself builds
 * (`src/query/client.ts`) — the condition under which TanStack logs
 * "No queryFn was passed as an option" for any query created without one.
 */
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
}

function show(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
    </QueryClientProvider>,
  );
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fileStore.clear();
  mockMe.mockResolvedValue({ user: PROFILE });
  mockTasks.mockResolvedValue({ tasks: [], timeZone: ZONE });
  useSession.setState({ status: 'unknown', profile: null });
  useCoordinator.getState().reset();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

/**
 * The root layout watches the cached task list to feed `TaskActionCoordinator`
 * (ios/App/RootView.swift:47-50). It must do that WITHOUT creating a query that has no `queryFn`.
 */
describe('the root layout’s view of the task cache', () => {
  it('emits no console error when the client has no default queryFn', async () => {
    const queryClient = makeClient();

    await show(queryClient);
    await waitFor(() => expect(mockMe).toHaveBeenCalled());

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('never fetches the task list itself', async () => {
    const queryClient = makeClient();

    await show(queryClient);
    await waitFor(() => expect(mockMe).toHaveBeenCalled());

    // `enabled: false`: only a screen that mounts `useTasks()` may issue the request.
    expect(mockTasks).not.toHaveBeenCalled();
  });

  it('still hands the coordinator the list a screen has loaded', async () => {
    const queryClient = makeClient();
    await show(queryClient);
    await waitFor(() => expect(useSession.getState().profile?.id).toBe('u1'));

    // A screen loads the tasks; the root layout is observing the same cache entry.
    queryClient.setQueryData(queryKeys.tasks.all(), { tasks: [task({ id: 't1' })], timeZone: ZONE });

    await waitFor(() => expect(useCoordinator.getState().actions).toHaveLength(1));
    expect(useCoordinator.getState().actions[0]).toMatchObject({ taskId: 't1', contactName: 'Damien' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('holds off until there is a signed-in account', async () => {
    mockMe.mockResolvedValue({ user: null });
    const queryClient = makeClient();
    await show(queryClient);
    await waitFor(() => expect(mockMe).toHaveBeenCalled());

    queryClient.setQueryData(queryKeys.tasks.all(), { tasks: [task({ id: 't1' })], timeZone: ZONE });

    await waitFor(() => expect(useSession.getState().status).toBe('signedOut'));
    expect(useCoordinator.getState().actions).toEqual([]);
  });
});

/**
 * A sheet is presented from a tab — the Account sheet, say — and then the session ends. The guards
 * unmount the navigator that owns it, so a dismissal that arrives afterwards has nothing left to
 * handle it: "GO_BACK was not handled by any navigator", with the sheet still on screen over the
 * sign-in view. The gate therefore dismisses on the TRANSITION, before React re-renders the guards,
 * and it does so for every path into `signedOut` — not just the Sign out button.
 */
describe('a session that ends while a sheet is presented', () => {
  /** A 401 from any request, answered by the handler `RootNavigator` installs through `onSignedOut`. */
  function respondWith401() {
    const handler = mockOnSignedOut.mock.calls.at(-1)?.[0] as () => void;
    const client = createApiClient({
      baseUrl: 'https://example.com',
      onSignedOut: handler,
      fetch: async () => new Response('', { status: 401 }),
    });
    return act(async () => {
      await expect(client.get('/api/tasks')).rejects.toMatchObject({ code: 'SIGNED_OUT' });
    });
  }

  it('dismisses the sheet before the guards swap to the auth group', async () => {
    await show(makeClient());
    await waitFor(() => expect(screen.getByTestId('screen-(tabs)')).toBeTruthy());

    // The sheet is up over the tabs.
    mockCanDismiss.mockReturnValue(true);
    const tabsStillMounted: boolean[] = [];
    mockDismissAll.mockImplementation(() => {
      // The navigator that owns the sheet has to be there to receive this.
      tabsStillMounted.push(screen.queryByTestId('screen-(tabs)') !== null);
      mockCanDismiss.mockReturnValue(false);
    });

    await respondWith401();

    expect(mockDismissAll).toHaveBeenCalledTimes(1);
    expect(tabsStillMounted).toEqual([true]);
    // ...and only then does the gate swap groups, with nothing left presented over it.
    await waitFor(() => expect(screen.queryByTestId('screen-(tabs)')).toBeNull());
    expect(screen.getByTestId('screen-(auth)')).toBeTruthy();
  });

  it('dismisses nothing when no sheet is presented', async () => {
    await show(makeClient());
    await waitFor(() => expect(screen.getByTestId('screen-(tabs)')).toBeTruthy());

    mockCanDismiss.mockReturnValue(false);
    await respondWith401();

    expect(mockDismissAll).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('screen-(auth)')).toBeTruthy());
  });

  /** The same 401 burst `onSignedOut` is idempotent against must not dismiss the screen behind it. */
  it('dismisses once for a burst of 401s, not once each', async () => {
    await show(makeClient());
    await waitFor(() => expect(screen.getByTestId('screen-(tabs)')).toBeTruthy());

    mockCanDismiss.mockReturnValue(true);
    await respondWith401();
    await respondWith401();

    expect(mockDismissAll).toHaveBeenCalledTimes(1);
  });
});
