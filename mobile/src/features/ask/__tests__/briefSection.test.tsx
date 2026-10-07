import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Share } from 'react-native';

import { useCoordinator } from '../../../actions/coordinator';
import type { AssistantTurn, NexdoTask } from '../../../api';
import type { StoredTaskAction } from '../../../lib/taskAction';
import { useAssistantStore } from '../../../store/assistant';
import { useSession } from '../../../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { index: '0' };
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

const mockTasks = jest.fn();
const mockUpdateTask = jest.fn();
jest.mock('../../../api', () => ({
  ...jest.requireActual('../../../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  },
}));

import BriefSection from '../../../../app/ask/brief/[index]';
import { setBriefHandlers } from '../briefHandlers';

/** `BriefSectionDetailView` (ios/App/BriefSectionDetailView.swift), as `app/ask/brief/[index]`. */

const GUTTER: NexdoTask = {
  id: 't1',
  title: 'Contact gutter technician',
  status: 'PLANNED',
  priority: 'HIGH',
  durationMin: 30,
  notes: 'Discuss gutter repair and get an estimate.',
  dueAt: '2020-09-25T18:00:00Z',
  timeZone: 'UTC',
};
const REPORT: NexdoTask = { id: 't2', title: 'Send the report', status: 'PLANNED', priority: 'NORMAL', durationMin: 45, startAt: '2099-01-02T15:00:00Z', timeZone: 'UTC' };

const BRIEF: AssistantTurn = {
  spoken: '',
  visual: {
    summary: '',
    sections: [
      { title: 'Top priorities', items: ['Contact gutter technician is overdue. Tackle it first.', 'Send the report — due today'] },
      { title: 'Next move', items: ['Call the gutter technician now.'] },
    ],
  },
  contextActionId: null,
  confirmation: null,
  executive: null,
};

const ask = jest.fn();
const read = jest.fn();

async function open(index = '0', tasks: NexdoTask[] = [GUTTER, REPORT]) {
  mockParams = { index, title: 'Fallback title' };
  mockTasks.mockResolvedValue({ tasks, timeZone: 'UTC' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <BriefSection />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockTasks).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  useAssistantStore.getState().reset();
  useAssistantStore.getState().setTurn(BRIEF, 'Give me my full day briefing for today: priorities, deadlines, conflicts, and my next move.');
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Ada', email: 'a@b.com', timeZone: 'UTC' } });
  useCoordinator.getState().reset();
  setBriefHandlers({ ask, read });
});

it('heads the page with the section, its count and the focus banner', async () => {
  await open();
  await waitFor(() => expect(screen.getByTestId('brief-detail-count')).toHaveTextContent('2 items to focus on'));
  expect(screen.getByRole('header')).toHaveTextContent('Top Priorities');
  expect(screen.getByText('Focus on what matters')).toBeTruthy();
  expect(screen.getByText('Based on your schedule, deadlines, and context.')).toBeTruthy();
});

it('turns a line naming one open task into a task card, with its notes, date, duration and pills', async () => {
  await open();
  await waitFor(() => expect(screen.getByTestId('brief-task-card-0')).toBeTruthy());
  const card = within(screen.getByTestId('brief-task-card-0'));
  expect(card.getByText('Contact gutter technician')).toBeTruthy();
  expect(card.getByText('Overdue')).toBeTruthy();
  expect(card.getByText('Sep 25, 2020 at 6:00 PM')).toBeTruthy();
  expect(card.getByText('30 min')).toBeTruthy();
  // Notes win over the briefing line.
  expect(card.getByText('Discuss gutter repair and get an estimate.')).toBeTruthy();
  expect(card.queryByText('Contact gutter technician is overdue. Tackle it first.')).toBeNull();
  expect(card.getByLabelText('Open')).toBeTruthy();
  expect(card.getByLabelText('Add Note')).toBeTruthy();
  expect(card.getByLabelText('Schedule')).toBeTruthy();
  // A scheduled task says Reschedule, and shows its time when there is no deadline.
  const second = within(screen.getByTestId('brief-task-card-1'));
  expect(second.getByLabelText('Reschedule')).toBeTruthy();
  expect(second.getByText('Jan 2, 2099 at 3:00 PM')).toBeTruthy();
  expect(second.getByText('Send the report — due today')).toBeTruthy();
});

it('opens the task, at its notes or its schedule', async () => {
  await open();
  await waitFor(() => expect(screen.getByTestId('brief-task-0')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('brief-task-0'));
  await fireEvent.press(screen.getByTestId('brief-open-0'));
  await fireEvent.press(screen.getByTestId('brief-note-0'));
  await fireEvent.press(screen.getByTestId('brief-schedule-0'));
  expect(mockPush.mock.calls.map((call) => call[0])).toEqual([
    { pathname: '/task/[id]', params: { id: 't1' } },
    { pathname: '/task/[id]', params: { id: 't1' } },
    { pathname: '/task/[id]', params: { id: 't1', section: 'notes' } },
    { pathname: '/task/[id]', params: { id: 't1', section: 'schedule' } },
  ]);
});

it('completes the task from its circle', async () => {
  mockUpdateTask.mockResolvedValue({ task: { ...GUTTER, status: 'COMPLETED' } });
  await open();
  await waitFor(() => expect(screen.getByLabelText('Complete Contact gutter technician')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Complete Contact gutter technician'));
  await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'COMPLETED' })));
});

it('offers Call and Message for a task with a contact action, starting the chosen channel', async () => {
  useCoordinator.getState().reset({ actions: [{ id: 'act-1', taskId: 't1' } as StoredTaskAction] });
  await open();
  await waitFor(() => expect(screen.getByTestId('brief-call-0')).toBeTruthy());
  expect(screen.queryByTestId('brief-open-0')).toBeNull();
  await fireEvent.press(screen.getByTestId('brief-call-0'));
  await fireEvent.press(screen.getByTestId('brief-message-0'));
  expect(mockPush.mock.calls.map((call) => call[0])).toEqual([
    { pathname: '/action/[id]', params: { id: 'act-1', preferred: 'call', start: '1' } },
    { pathname: '/action/[id]', params: { id: 'act-1', preferred: 'message', start: '1' } },
  ]);
});

it('shows any other line as an insight card', async () => {
  await open('1');
  await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
  expect(screen.getByTestId('brief-detail-count')).toHaveTextContent('1 item to review');
  expect(screen.getByText('Your next move')).toBeTruthy();
  expect(within(screen.getByTestId('brief-insight-0')).getByText('Call the gutter technician now.')).toBeTruthy();
});

it('"Ask Nexdo" goes back to the brief and asks about every line', async () => {
  await open('1');
  await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
  await fireEvent.press(screen.getByTestId('brief-detail-ask'));
  expect(mockBack).toHaveBeenCalled();
  expect(ask).toHaveBeenCalledWith('Help me with these next move:\nCall the gutter technician now.');
});

it('the options menu reads the section aloud or shares it', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  await open('1');
  await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
  await fireEvent.press(screen.getByLabelText('Briefing options'));
  await fireEvent.press(screen.getByTestId('brief-detail-read'));
  expect(read).toHaveBeenCalledWith(1, 'Call the gutter technician now.');
  await fireEvent.press(screen.getByLabelText('Briefing options'));
  await fireEvent.press(screen.getByTestId('brief-detail-share'));
  expect(share).toHaveBeenCalledWith({ message: 'Call the gutter technician now.' });
  share.mockRestore();
});

it('shows why Read aloud did nothing, since this page hides the Ask composer', async () => {
  read.mockReturnValueOnce('Allow OpenAI sharing in Account to use Read Loud.');
  await open('1');
  await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
  expect(screen.queryByTestId('brief-detail-read-error')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Briefing options'));
  await fireEvent.press(screen.getByTestId('brief-detail-read'));
  expect(screen.getByTestId('brief-detail-read-error')).toHaveTextContent('Allow OpenAI sharing in Account to use Read Loud.');
});

it('a section that has gone keeps its title over an empty page; Back goes back', async () => {
  // No open task names a priority line any more, so the priorities section is gone.
  await open('5', []);
  expect(screen.getByRole('header')).toHaveTextContent('Fallback title');
  expect(screen.getByText('Nothing to report here today.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back to briefing'));
  expect(mockBack).toHaveBeenCalled();
});
