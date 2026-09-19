import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { DoNowRecommendation, NexdoTask, ProtectedTimeProposal } from '../api';
import { queryKeys } from '../query/keys';
import { useAppearance } from '../store/appearance';
import { useConsent } from '../store/consent';
import { useSession } from '../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

const mockTasks = jest.fn();
const mockAgenda = jest.fn();
const mockIntelligence = jest.fn();
const mockNextAction = jest.fn();
const mockProtectedTime = jest.fn();
const mockRespond = jest.fn();
const mockDismissNext = jest.fn();
jest.mock('../api/shopping', () => ({ shoppingEndpoints: { list: async () => ({ lists: [] }) } }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    agenda: (...args: unknown[]) => mockAgenda(...args),
    scheduleIntelligence: (...args: unknown[]) => mockIntelligence(...args),
    nextAction: (...args: unknown[]) => mockNextAction(...args),
    protectedTime: (...args: unknown[]) => mockProtectedTime(...args),
    respondToProtectedTime: (...args: unknown[]) => mockRespond(...args),
    dismissNextAction: (...args: unknown[]) => mockDismissNext(...args),
  },
}));

// The session itself is covered by `src/voice/conversation.test.ts`; the screen only needs a shape.
const mockUseVoiceSession = jest.fn();
jest.mock('../voice/useVoiceSession', () => ({
  useVoiceSession: (...args: unknown[]) => mockUseVoiceSession(...args),
  START_FAILED: 'Couldn’t start voice. Close this screen and try again.',
}));

import Today from '../../app/(tabs)/today/index';
import { AddTaskByVoiceView } from '../components/AddTaskByVoiceView';

const ZONE = 'America/Los_Angeles';
const PROFILE = { id: 'u1', name: 'Ada Lovelace', email: 'a@b.c', timeZone: ZONE };

function voiceSession(overrides: Record<string, unknown> = {}) {
  return {
    state: { phase: 'listening', muted: false, transcript: '', reply: '', error: null, sessionCreatedTasks: [] },
    starting: false,
    startupError: null,
    toggleMute: jest.fn(),
    finish: jest.fn(),
    close: jest.fn(),
    ...overrides,
  };
}

function show(node: React.ReactElement, tasks: NexdoTask[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(queryKeys.tasks.all(), { tasks, timeZone: ZONE });
  queryClient.setQueryData(queryKeys.me(), PROFILE);
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTasks.mockResolvedValue({ tasks: [], timeZone: ZONE });
  mockAgenda.mockResolvedValue({ timeZone: ZONE, range: { days: [] }, tasks: [], events: [], overdue: [] });
  mockIntelligence.mockRejectedValue(new Error('not in this test'));
  mockNextAction.mockResolvedValue({ enabled: false, recommendation: null, contextActionId: null });
  mockProtectedTime.mockResolvedValue({ proposal: null });
  mockUseVoiceSession.mockReturnValue(voiceSession());
  useSession.setState({ status: 'signedIn', profile: PROFILE });
  useConsent.setState({ ai: true, voice: true });
  useAppearance.setState({ appearance: 'system', voiceVolume: 1 });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined).mockClear();
});

/** `AddTaskByVoiceView` body (ios/App/AddTaskByVoiceView.swift:27-124). */
describe('the voice screen', () => {
  it('renders the task-mode copy, the orb, the status and the two controls', async () => {
    await show(<AddTaskByVoiceView />);

    expect(screen.getByText('Add by Voice')).toBeTruthy();
    expect(screen.getByText('Speak your task')).toBeTruthy();
    expect(screen.getByText('Tell me what you want to do. Keep talking to add more or make changes.')).toBeTruthy();
    // The orb is `accessibilityHidden` in Swift (AddTaskByVoiceView.swift:159), so it is excluded
    // from the accessibility tree here too.
    expect(screen.getByTestId('voice-orb', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('voice-status')).toHaveTextContent('Listening…');
    expect(screen.getByTestId('voice-mute')).toBeTruthy();
    expect(screen.getByTestId('voice-done')).toBeTruthy();
    expect(screen.getByText('“Call Damien tomorrow at 11 AM”')).toBeTruthy();
  });

  it('renders the ask-mode copy', async () => {
    await show(<AddTaskByVoiceView askMode />);

    expect(screen.getByText('Ask by Voice')).toBeTruthy();
    expect(screen.getByText('Ask Nexdo anything')).toBeTruthy();
    // 8c5f969: the prompt and the first two examples name moments and shopping lists.
    expect(screen.getByText('Ask about tasks, calendar, important moments, or shopping lists. Keep talking to plan or make changes.')).toBeTruthy();
    expect(screen.getByText('“What birthdays are coming up?”')).toBeTruthy();
    expect(screen.getByText('“Add two gallons of milk to my shopping list”')).toBeTruthy();
    expect(screen.getByText('“Remind me to call Damien at 11 AM”')).toBeTruthy();
    expect(screen.queryByText('“What should I focus on today?”')).toBeNull();
    expect(screen.queryByText('“Find time for a walk tomorrow”')).toBeNull();
  });

  it('renders the calendar-mode copy and asks for the calendar scope', async () => {
    await show(<AddTaskByVoiceView calendarOnly />);

    expect(screen.getByText('Speak your appointment')).toBeTruthy();
    expect(screen.getByText('Tell me the event, date, and time. I’ll add it to your calendar.')).toBeTruthy();
    expect(screen.getByText('“Dentist appointment tomorrow at 11 AM for 30 minutes”')).toBeTruthy();
    expect(mockUseVoiceSession).toHaveBeenCalledWith(expect.objectContaining({ scope: 'calendar' }));
  });

  /**
   * A guard against the Phase 3 stub's invented flow: Swift has no transcript review and no
   * "Add this task" confirmation — the model saves through tool calls.
   */
  it('has no review-and-confirm step', async () => {
    await show(<AddTaskByVoiceView />);

    expect(screen.queryByText('Add this task')).toBeNull();
    expect(screen.queryByText('Ready to add')).toBeNull();
    expect(screen.queryByText('Tap to start')).toBeNull();
    expect(screen.queryByText('Start speaking')).toBeNull();
  });

  it('shows the transcript, the reply and what the session created', async () => {
    mockUseVoiceSession.mockReturnValue(
      voiceSession({
        state: {
          phase: 'assistantSpeaking',
          muted: false,
          transcript: 'Call Damien tomorrow',
          reply: 'Added it for 11 AM.',
          error: null,
          sessionCreatedTasks: [{ id: 't1', title: 'Call Damien', status: 'PLANNED', priority: 'NORMAL', durationMin: 30 }],
        },
      }),
    );

    await show(<AddTaskByVoiceView />);

    expect(screen.getByTestId('voice-transcript')).toHaveTextContent('Call Damien tomorrow');
    expect(screen.getByTestId('voice-reply')).toHaveTextContent('Added it for 11 AM.');
    expect(screen.getByText('Added this session')).toBeTruthy();
    expect(screen.getByText('Call Damien')).toBeTruthy();
    // The examples give way to the list.
    expect(screen.queryByText('Try saying something like:')).toBeNull();
  });

  it('reports Connecting… while starting, and a startup failure', async () => {
    mockUseVoiceSession.mockReturnValue(voiceSession({ starting: true, startupError: 'Couldn’t start voice. Close this screen and try again.' }));

    await show(<AddTaskByVoiceView />);

    expect(screen.getByTestId('voice-status')).toHaveTextContent('Connecting…');
    expect(screen.getByTestId('voice-error')).toHaveTextContent(/Couldn’t start voice/);
  });

  it('shows Unmute and disables the control outside a live phase', async () => {
    mockUseVoiceSession.mockReturnValue(
      voiceSession({ state: { phase: 'connecting', muted: true, transcript: '', reply: '', error: null, sessionCreatedTasks: [] } }),
    );

    await show(<AddTaskByVoiceView />);

    expect(screen.getByText('Unmute')).toBeTruthy();
    expect(screen.getByTestId('voice-mute').props.accessibilityState).toMatchObject({ disabled: true });
    // `status` puts Muted ahead of every phase but the three closed ones (VoiceConversationSession.swift:131).
    expect(screen.getByTestId('voice-status')).toHaveTextContent('Muted');
  });

  it('Done finishes the session rather than closing it', async () => {
    const session = voiceSession();
    mockUseVoiceSession.mockReturnValue(session);
    await show(<AddTaskByVoiceView />);

    fireEvent.press(screen.getByTestId('voice-done'));

    expect(session.finish).toHaveBeenCalled();
    expect(session.close).not.toHaveBeenCalled();
  });

  it('Close ends the session and dismisses', async () => {
    const session = voiceSession();
    mockUseVoiceSession.mockReturnValue(session);
    await show(<AddTaskByVoiceView />);

    fireEvent.press(screen.getByTestId('voice-close'));

    expect(session.close).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  /** The consent alert (AddTaskByVoiceView.swift:87-91). */
  it('asks for consent before starting, with Swift’s copy, and does not start until it is given', async () => {
    useConsent.setState({ ai: false, voice: false });

    await show(<AddTaskByVoiceView />);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Use voice to manage tasks?');
    expect(body).toMatch(/Your voice and relevant task, calendar, and recommendation details are shared with OpenAI/);
    expect(buttons.map((button) => button.text)).toEqual(['Not now', 'Allow and start']);
    expect(mockUseVoiceSession).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));

    buttons[1].onPress?.();
    await waitFor(() => expect(useConsent.getState()).toMatchObject({ ai: true, voice: true }));
  });

  it('uses the calendar title for the consent alert in calendar mode', async () => {
    useConsent.setState({ ai: false, voice: false });

    await show(<AddTaskByVoiceView calendarOnly />);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Use voice to add calendar events?');
  });

  it('"Not now" dismisses without starting', async () => {
    useConsent.setState({ ai: false, voice: false });
    await show(<AddTaskByVoiceView />);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];

    buttons[0].onPress?.();

    expect(mockBack).toHaveBeenCalled();
    expect(useConsent.getState().ai).toBe(false);
  });

  it('does not ask again when consent is already held', async () => {
    await show(<AddTaskByVoiceView />);
    await waitFor(() => expect(mockUseVoiceSession).toHaveBeenCalledWith(expect.objectContaining({ enabled: true })));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

/** Sections 7 and 8 of `TodayView.body` (ios/App/RootView.swift:1095-1126). */
describe('the last two Today sections', () => {
  const PROPOSAL: ProtectedTimeProposal = {
    taskId: 't1',
    title: 'Write the report',
    startAt: '2026-09-17T18:00:00.000Z',
    endAt: '2026-09-17T18:45:00.000Z',
    durationMin: 45,
    postponeCount: 3,
    expectedUpdatedAt: '2026-09-16T10:00:00.000Z',
  };

  const RECOMMENDATION: DoNowRecommendation = {
    generatedAt: '2026-09-17T17:00:00.000Z',
    timeZone: ZONE,
    summary: 'Start the report.',
    nextAction: {
      bestAction: { taskId: 't1', title: 'Write the report', focusMinutes: 45, durationMin: 45, partial: false, reasons: ['Due soon'] },
      alternatives: [],
      continuingFocus: false,
      availableWindowMinutes: 90,
    },
    recommendedActions: [{ type: 'START_FOCUS' }],
  };

  it('shows no proposal, and Focus next in its empty state, when the server offers nothing', async () => {
    await show(<Today />);

    await waitFor(() => expect(mockNextAction).toHaveBeenCalled());
    expect(screen.queryByTestId('today-protected-time')).toBeNull();
    // Since 63d9542 the card stays, offering "Find my next task" (RootView.swift:1127-1130).
    expect(screen.getByTestId('today-focus-next')).toBeTruthy();
    expect(screen.getByText('Find a task for the time you have.')).toBeTruthy();
    expect(screen.queryByTestId('today-focus-start')).toBeNull();
  });

  it('renders the protected-time proposal with Swift’s copy', async () => {
    mockProtectedTime.mockResolvedValue({ proposal: PROPOSAL });

    await show(<Today />);

    await waitFor(() => expect(screen.getByTestId('today-protected-time')).toBeTruthy());
    expect(screen.getByText('Make room for important work')).toBeTruthy();
    expect(screen.getByText('You’ve postponed Write the report 3 times.')).toBeTruthy();
    expect(screen.getByText(/^Reserve 45 minutes at .+\?$/)).toBeTruthy();
    expect(screen.getByText('Nexdo will keep this block in place during replanning. You can still move it yourself.')).toBeTruthy();
  });

  it('Reserve time accepts, with the proposal’s own identifiers', async () => {
    mockProtectedTime.mockResolvedValue({ proposal: PROPOSAL });
    mockRespond.mockResolvedValue({ warnings: [] });
    await show(<Today />);
    await waitFor(() => expect(screen.getByTestId('today-protected-accept')).toBeTruthy());

    fireEvent.press(screen.getByTestId('today-protected-accept'));

    await waitFor(() => expect(mockRespond).toHaveBeenCalled());
    expect(mockRespond).toHaveBeenCalledWith({
      accept: true,
      taskId: 't1',
      startAt: PROPOSAL.startAt,
      expectedUpdatedAt: PROPOSAL.expectedUpdatedAt,
    });
  });

  it('Not now declines', async () => {
    mockProtectedTime.mockResolvedValue({ proposal: PROPOSAL });
    mockRespond.mockResolvedValue({ warnings: [] });
    await show(<Today />);
    await waitFor(() => expect(screen.getByTestId('today-protected-decline')).toBeTruthy());

    fireEvent.press(screen.getByTestId('today-protected-decline'));

    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith(expect.objectContaining({ accept: false })));
  });

  it('surfaces the receipt’s warnings', async () => {
    mockProtectedTime.mockResolvedValue({ proposal: PROPOSAL });
    mockRespond.mockResolvedValue({ warnings: ['That block overlaps a meeting.'] });
    await show(<Today />);
    await waitFor(() => expect(screen.getByTestId('today-protected-accept')).toBeTruthy());

    fireEvent.press(screen.getByTestId('today-protected-accept'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Unable to complete request', 'That block overlaps a meeting.'));
  });

  it('renders Focus next with the title and "N min · Fits your free time"', async () => {
    mockNextAction.mockResolvedValue({ enabled: true, recommendation: RECOMMENDATION, contextActionId: 'ctx-1' });

    await show(<Today />);

    await waitFor(() => expect(screen.getByTestId('today-focus-title').props.children).toBe('Write the report'));
    expect(screen.getByText('Focus next')).toBeTruthy();
    expect(screen.getByTestId('today-focus-detail').props.children).toBe('45 min · Fits your free time');
    expect(screen.getByText('Start focus')).toBeTruthy();
    expect(screen.getByTestId('today-focus-other')).toBeTruthy();
    // The old card's copy is gone.
    expect(screen.queryByText('What should I do now?')).toBeNull();
    expect(screen.queryByText('Start Focus Session')).toBeNull();
    expect(screen.queryByText(/available$/)).toBeNull();
  });

  it('falls back to the empty state when the recommendation has no best action', async () => {
    mockNextAction.mockResolvedValue({
      enabled: true,
      recommendation: { ...RECOMMENDATION, nextAction: { bestAction: null, availableWindowMinutes: 0 } },
      contextActionId: 'ctx-1',
    });

    await show(<Today />);

    await waitFor(() => expect(mockNextAction).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('today-focus-find')).toBeTruthy());
    expect(screen.queryByTestId('today-focus-title')).toBeNull();
  });

  it('drops "Fits your free time" and disables Start focus when the recommendation cannot start', async () => {
    mockNextAction.mockResolvedValue({
      enabled: true,
      recommendation: { ...RECOMMENDATION, recommendedActions: [{ type: 'REVIEW' }] },
      contextActionId: 'ctx-1',
    });

    await show(<Today />);

    await waitFor(() => expect(screen.getByTestId('today-focus-start')).toBeTruthy());
    expect(screen.getByTestId('today-focus-detail').props.children).toBe('45 min');
    expect(screen.getByTestId('today-focus-start').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('Other options, beside Start focus and in the "…" menu, opens Do Now', async () => {
    mockNextAction.mockResolvedValue({ enabled: true, recommendation: RECOMMENDATION, contextActionId: 'ctx-1' });
    await show(<Today />);
    await waitFor(() => expect(screen.getByTestId('today-focus-other')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-focus-other'));
    expect(mockPush).toHaveBeenCalledWith('/today/do-now');

    mockPush.mockClear();
    await fireEvent.press(screen.getByLabelText('Focus options'));
    await fireEvent.press(screen.getByTestId('today-focus-menu-other'));
    expect(mockPush).toHaveBeenCalledWith('/today/do-now');
    // Choosing closes the menu.
    expect(screen.queryByTestId('today-focus-menu-other')).toBeNull();
  });

  it('Dismiss suggestion in the "…" menu tells the server which suggestion was dismissed', async () => {
    mockNextAction.mockResolvedValue({ enabled: true, recommendation: RECOMMENDATION, contextActionId: 'ctx-1' });
    mockDismissNext.mockResolvedValue({ ok: true });
    await show(<Today />);
    await waitFor(() => expect(screen.getByTestId('today-focus-title')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Focus options'));
    await fireEvent.press(screen.getByTestId('today-focus-menu-dismiss'));

    await waitFor(() => expect(mockDismissNext).toHaveBeenCalledWith('ctx-1'));
  });

  it('Dismiss suggestion does nothing without a suggestion id, as Swift guards', async () => {
    await show(<Today />);
    await waitFor(() => expect(mockNextAction).toHaveBeenCalled());

    await fireEvent.press(screen.getByLabelText('Focus options'));
    await fireEvent.press(screen.getByTestId('today-focus-menu-dismiss'));

    expect(mockDismissNext).not.toHaveBeenCalled();
  });

  it('warns rather than starting focus on a task that is no longer in the list', async () => {
    mockNextAction.mockResolvedValue({ enabled: true, recommendation: RECOMMENDATION, contextActionId: 'ctx-1' });
    await show(<Today />);
    await waitFor(() => expect(screen.getByTestId('today-focus-start')).toBeTruthy());

    fireEvent.press(screen.getByTestId('today-focus-start'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Unable to complete request', 'Your tasks changed. Refresh Tasks and try again.'),
    );
  });
});
