import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { AppState, Share } from 'react-native';

import { useCoordinator } from '../../../actions/coordinator';
import type { AssistantTurn, NexdoTask } from '../../../api';
import type { StoredTaskAction } from '../../../lib/taskAction';
import { useAssistantStore } from '../../../store/assistant';
import { useAppearance } from '../../../store/appearance';
import { useConsent } from '../../../store/consent';
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
const stopVoiceReply = jest.fn();
const speak = Speech.speak as jest.Mock;
const stop = Speech.stop as jest.Mock;
/** The options the last `Speech.speak` call was given, so a test can finish or fail the utterance. */
const lastSpeech = () => speak.mock.calls.at(-1)?.[1] as Speech.SpeechOptions;

async function openMenu() {
  await fireEvent.press(screen.getByLabelText('Briefing options'));
}

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
  setBriefHandlers({ ask, stopVoiceReply });
  useConsent.setState({ ai: true, voice: true });
  useAppearance.setState({ voiceVolume: 0.8 });
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

it('the options menu shares the section', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  await open('1');
  await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
  await openMenu();
  await fireEvent.press(screen.getByTestId('brief-detail-share'));
  expect(share).toHaveBeenCalledWith({ message: 'Call the gutter technician now.' });
  share.mockRestore();
});

/** 04fa8d8 "Fix on-device Read aloud for iOS briefings" (BriefSectionDetailView.swift:44-54, :87-104, :196-255). */
describe('on-device Read aloud (Phase 15)', () => {
  it('reads the section on the phone, at the app’s voice level, after stopping any voice reply', async () => {
    // OpenAI sharing no longer matters: nothing leaves the phone.
    useConsent.setState({ ai: false, voice: false });
    await open();
    await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Top Priorities'));
    await openMenu();
    await fireEvent.press(screen.getByTestId('brief-detail-read'));

    expect(stopVoiceReply).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toBe('Contact gutter technician is overdue. Tackle it first.\n\nSend the report — due today');
    expect(lastSpeech().volume).toBe(0.8);
    expect(screen.queryByTestId('brief-detail-read-error')).toBeNull();
  });

  it('offers Stop reading while it reads, then Read aloud again once it has finished', async () => {
    await open('1');
    await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
    await openMenu();
    await fireEvent.press(screen.getByTestId('brief-detail-read'));
    await openMenu();
    expect(screen.queryByTestId('brief-detail-read')).toBeNull();
    expect(within(screen.getByTestId('brief-detail-stop')).getByText('Stop reading')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('brief-detail-stop'));
    expect(stop).toHaveBeenCalled();

    await openMenu();
    expect(within(screen.getByTestId('brief-detail-read')).getByText('Read aloud')).toBeTruthy();
    // And again, to the end this time.
    await fireEvent.press(screen.getByTestId('brief-detail-read'));
    expect(speak).toHaveBeenCalledTimes(2);
    await act(async () => lastSpeech().onDone?.());
    await openMenu();
    expect(screen.getByTestId('brief-detail-read')).toBeTruthy();
  });

  it('asks for spoken replies when they are off in Settings, and does not speak', async () => {
    useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Ada', email: 'a@b.com', timeZone: 'UTC', preference: { voiceEnabled: false } as never } });
    await open('1');
    await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
    await openMenu();
    await fireEvent.press(screen.getByTestId('brief-detail-read'));
    expect(screen.getByTestId('brief-detail-read-error')).toHaveTextContent('Enable spoken replies in Settings to use Read aloud.');
    expect(speak).not.toHaveBeenCalled();
    expect(stopVoiceReply).not.toHaveBeenCalled();
  });

  it('says so when the phone cannot read it', async () => {
    await open('1');
    await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
    await openMenu();
    await fireEvent.press(screen.getByTestId('brief-detail-read'));
    await act(async () => lastSpeech().onError?.(new Error('no engine')));
    expect(screen.getByTestId('brief-detail-read-error')).toHaveTextContent('Nexdo couldn’t start reading this briefing. Try again.');
    await openMenu();
    expect(screen.getByTestId('brief-detail-read')).toBeTruthy();
  });

  it('cannot read an empty section', async () => {
    await open('5', []);
    await openMenu();
    expect(screen.getByTestId('brief-detail-read').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('brief-detail-read'));
    expect(speak).not.toHaveBeenCalled();
  });

  it('stops reading when the app goes to the background, and when the page closes', async () => {
    // The preset's `AppState.addEventListener` is a mock; the page's listeners are in its calls.
    const added = AppState.addEventListener as unknown as jest.Mock;
    const before = added.mock.calls.length;
    await open('1');
    await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent('Next Move'));
    await openMenu();
    await fireEvent.press(screen.getByTestId('brief-detail-read'));
    const listeners = added.mock.calls.slice(before).filter(([type]) => type === 'change').map(([, listener]) => listener as (state: string) => void);
    expect(listeners.length).toBeGreaterThan(0);
    await act(async () => listeners.forEach((listener) => listener('background')));
    expect(stop).toHaveBeenCalledTimes(1);

    await openMenu();
    await fireEvent.press(screen.getByTestId('brief-detail-read'));
    await screen.unmount();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('splits a section longer than the phone can speak at once, and finishes after the last part', async () => {
    const long = Array.from({ length: 30 }, (_, n) => `Line ${n} ${'word '.repeat(40)}`.trim());
    useAssistantStore.getState().setTurn({ ...BRIEF, visual: { summary: '', sections: [{ title: 'Next move', items: long }] } }, 'brief');
    await open('0', []);
    await openMenu();
    await fireEvent.press(screen.getByTestId('brief-detail-read'));
    expect(speak.mock.calls.length).toBeGreaterThan(1);
    for (const [text] of speak.mock.calls) expect((text as string).length).toBeLessThanOrEqual(4000);
    expect(speak.mock.calls.map(([text]) => text).join(' ').replace(/\s+/g, ' ')).toBe(long.join('\n\n').replace(/\s+/g, ' '));

    await act(async () => (speak.mock.calls[0][1] as Speech.SpeechOptions).onDone?.());
    await openMenu();
    expect(screen.getByTestId('brief-detail-stop')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('brief-detail-menu-dismiss'));
    await act(async () => lastSpeech().onDone?.());
    await openMenu();
    expect(screen.getByTestId('brief-detail-read')).toBeTruthy();
  });
});

it('a section that has gone keeps its title over an empty page; Back goes back', async () => {
  // No open task names a priority line any more, so the priorities section is gone.
  await open('5', []);
  expect(screen.getByRole('header')).toHaveTextContent('Fallback title');
  expect(screen.getByText('Nothing to report here today.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back to briefing'));
  expect(mockBack).toHaveBeenCalled();
});
