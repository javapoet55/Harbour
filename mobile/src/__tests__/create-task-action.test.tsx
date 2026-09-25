import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { queryKeys } from '../query/keys';
import { useSession } from '../store/session';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

const mockCreate = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    createTask: (...args: unknown[]) => mockCreate(...args),
    projects: jest.fn(async () => ({ projects: [], unassignedTaskCount: 0 })),
  },
}));

import NewTask from '../../app/task/new';

const ZONE = 'America/Los_Angeles';

function show() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(queryKeys.me(), { id: 'u1', name: 'Ada', email: 'a@b.c', timeZone: ZONE });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewTask />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ task: { id: 't1', title: 'x', status: 'PLANNED', priority: 'NORMAL', durationMin: 30 } });
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Ada', email: 'a@b.c', timeZone: ZONE } });
});

/**
 * The detected-action line and `resolvedCreationDate` in the creation form
 * (ios/App/RootView.swift:1983-1986, `:2086-2089`).
 */
describe('the Nexdo Action hint', () => {
  it('is absent until the title looks like a contact task', async () => {
    await show();

    expect(screen.queryByTestId('new-task-action-hint')).toBeNull();

    fireEvent.changeText(screen.getByTestId('task-title'), 'Buy groceries');
    await waitFor(() => expect(screen.getByTestId('task-title').props.value).toBe('Buy groceries'));
    expect(screen.queryByTestId('new-task-action-hint')).toBeNull();
  });

  it('names the contact and the schedule once one is detected', async () => {
    await show();

    fireEvent.changeText(screen.getByTestId('task-title'), 'Call Damien tomorrow at 10 AM');

    await waitFor(() => expect(screen.getByTestId('new-task-action-hint')).toBeTruthy());
    expect(screen.getByTestId('new-task-action-hint')).toHaveTextContent(/^Nexdo Action: contact Damien\. Schedule: /);
  });

  /** `if !dateExplicitlyChosen, let date = …detect(title:)?.scheduledAt { return date }` (`:2087`). */
  it('sends the time detected in the title when no date pill was tapped', async () => {
    await show();

    fireEvent.changeText(screen.getByTestId('task-title'), 'Call Damien tomorrow at 10 AM');
    await waitFor(() => expect(screen.getByTestId('new-task-action-hint')).toBeTruthy());
    fireEvent.press(screen.getByTestId('create-task'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const sent = mockCreate.mock.calls[0][0] as { startAt: string };
    // 10 AM tomorrow in the ACCOUNT zone.
    const at = new Date(sent.startAt);
    const label = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', hour12: true }).format(at);
    expect(label).toBe('10 AM');
  });

  /** `dateExplicitlyChosen = true` (`:2061`): from then on the pills win. */
  it('a tapped date pill overrides the time in the title', async () => {
    await show();

    fireEvent.changeText(screen.getByTestId('task-title'), 'Call Damien tomorrow at 10 AM');
    await waitFor(() => expect(screen.getByTestId('new-task-action-hint')).toBeTruthy());
    fireEvent.press(screen.getByTestId('date-Today'));
    await waitFor(() => expect(screen.getByTestId('new-task-action-hint')).toBeTruthy());
    fireEvent.press(screen.getByTestId('create-task'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const sent = mockCreate.mock.calls[0][0] as { startAt: string };
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(sent.startAt));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
    expect(day).toBe(today);
  });
});
