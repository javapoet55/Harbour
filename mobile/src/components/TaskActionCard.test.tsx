import { fireEvent, render, screen } from '@testing-library/react-native';

import type { NexdoTask } from '../api/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

import { TaskActionCard } from './TaskActionCard';

/** `TaskActionCard`'s completed branch (ios/App/TaskActionView.swift:37-41, 6f079c0). No capture (needs sign-in). */

function task(overrides: Partial<NexdoTask>): NexdoTask {
  return { id: 't1', title: 'Follow up with Acme Insurance', status: 'COMPLETED', priority: 'NORMAL', durationMin: 15, timeZone: 'America/Los_Angeles', ...overrides } as NexdoTask;
}

beforeEach(() => mockPush.mockClear());

it('offers the follow-up history on a completed task that is still a detected action', async () => {
  await render(<TaskActionCard onOpen={jest.fn()} task={task({})} />);
  expect(screen.getByTestId('task-follow-up-history')).toHaveTextContent('Follow-up preparation and outcome history');
  await fireEvent.press(screen.getByTestId('task-follow-up-history'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/action/preparation', params: { taskId: 't1' } });
});

it('shows nothing for a completed task that is not an action, or an open one without an action', async () => {
  await render(<TaskActionCard onOpen={jest.fn()} task={task({ title: 'Read a book' })} />);
  expect(screen.queryByTestId('task-follow-up-history')).toBeNull();
  await render(<TaskActionCard onOpen={jest.fn()} task={task({ status: 'PLANNED' })} />);
  expect(screen.queryByTestId('task-follow-up-history')).toBeNull();
  expect(screen.queryByTestId('task-action-card')).toBeNull();
});
