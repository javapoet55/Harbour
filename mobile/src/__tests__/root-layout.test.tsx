import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import type { NexdoTask } from '../api';
import { useCoordinator } from '../actions/coordinator';
import { queryKeys } from '../query/keys';
import { useSession } from '../store/session';

jest.mock('expo-router', () => {
  const { View } = require('react-native') as typeof import('react-native');
  function Stack({ children }: { children?: React.ReactNode }) {
    return <View>{children}</View>;
  }
  function Screen() {
    return null;
  }
  function Protected({ children }: { children?: React.ReactNode }) {
    return <View>{children}</View>;
  }
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return { Stack, router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}) };
});

// The notification wiring has its own suite; here it would only add listeners.
jest.mock('../actions/useActionNotifications', () => ({ useActionNotifications: () => undefined }));

const mockMe = jest.fn();
const mockTasks = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
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
