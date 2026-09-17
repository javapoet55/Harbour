import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { NexdoTask } from '../api/types';
import { DEFAULT_TASK_QUERY } from '../lib/taskQuery';
import { resetRevisions } from '../query/taskRevision';
import { useSession } from '../store/session';
import { useTaskQuery } from '../store/taskQuery';

const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const { View } = require('react-native') as typeof import('react-native');
  function Screen({
    options,
  }: {
    options?: { headerLeft?: () => React.ReactNode; headerRight?: () => React.ReactNode };
  }) {
    return (
      <View>
        {options?.headerLeft?.()}
        {options?.headerRight?.()}
      </View>
    );
  }
  function StackRoot({ children }: { children?: React.ReactNode }) {
    return <View>{children}</View>;
  }
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
    Stack: Object.assign(StackRoot, { Screen }),
  };
});

const mockTasks = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { tasks: (...args: unknown[]) => mockTasks(...args) },
}));

import TaskFilters from '../../app/task/filters';

const ZONE = 'Asia/Kolkata';

const FIXTURE: NexdoTask[] = [
  { id: 'a', title: 'One', status: 'PLANNED', priority: 'HIGH', durationMin: 30 },
  { id: 'b', title: 'Two', status: 'PLANNED', priority: 'LOW', durationMin: 30 },
];

function wrap() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TaskFilters />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRevisions();
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  useTaskQuery.setState({ query: { ...DEFAULT_TASK_QUERY } });
  mockTasks.mockResolvedValue({ tasks: FIXTURE, timeZone: ZONE });
});

/**
 * The sheet is a `Form` with three rows (RootView.swift:1710-1719), not a list of every option, so
 * what is worth pinning down is that the pickers stay COLLAPSED until tapped — that was the shape
 * the screen got wrong.
 */
describe('Task filters', () => {
  it('shows the two pickers collapsed, carrying their current value', async () => {
    wrap();
    await waitFor(() => expect(mockTasks).toHaveBeenCalled());

    expect(screen.getByTestId('filter-status')).toBeTruthy();
    expect(screen.getByTestId('filter-priority')).toBeTruthy();
    expect(screen.getByLabelText('Status, Open')).toBeTruthy();
    expect(screen.getByLabelText('Priority, All')).toBeTruthy();
    // Collapsed: no option row is on screen yet.
    expect(screen.queryByTestId('status-Completed')).toBeNull();
    expect(screen.queryByTestId('priority-HIGH')).toBeNull();
  });

  it('expands a picker on tap, applies the choice and collapses again', async () => {
    wrap();
    await waitFor(() => expect(mockTasks).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('filter-status'));
    await waitFor(() => expect(screen.getByTestId('status-Completed')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('status-Completed'));

    expect(useTaskQuery.getState().query.status).toBe('Completed');
    await waitFor(() => expect(screen.queryByTestId('status-Completed')).toBeNull());
    expect(screen.getByLabelText('Status, Completed')).toBeTruthy();
  });

  it('offers only the priorities the loaded tasks actually use', async () => {
    wrap();
    await waitFor(() => expect(mockTasks).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('filter-priority'));

    // `Set(model.tasks.map(\.priority)).sorted()` (RootView.swift:1712), plus the "All" tag.
    await waitFor(() => expect(screen.getByTestId('priority-All')).toBeTruthy());
    expect(screen.getByTestId('priority-HIGH')).toBeTruthy();
    expect(screen.getByTestId('priority-LOW')).toBeTruthy();
    expect(screen.queryByTestId('priority-CRITICAL')).toBeNull();
  });

  it('puts Done in the header, where `.confirmationAction` puts it', async () => {
    wrap();
    await waitFor(() => expect(mockTasks).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('filters-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('resets to the Swift defaults', async () => {
    useTaskQuery.setState({ query: { ...DEFAULT_TASK_QUERY, status: 'All', priority: 'HIGH' } });
    wrap();
    await waitFor(() => expect(mockTasks).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('reset-filters'));

    expect(useTaskQuery.getState().query.status).toBe('Open');
    expect(useTaskQuery.getState().query.priority).toBe('All');
  });
});
