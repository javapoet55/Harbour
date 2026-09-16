import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AssistantTurn } from '../api';
import { useAssistantStore } from '../store/assistant';
import { useConsent } from '../store/consent';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
}));

const mockAssistant = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { assistant: (...args: unknown[]) => mockAssistant(...args) },
}));

import Ask from '../../app/ask/index';
import AskText from '../../app/ask/text';

function turn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
  return {
    spoken: 'Here is your day.',
    visual: {
      summary: 'Three things matter today.',
      sections: [{ title: 'Today', items: ['Pack the boxes', 'Ship the deck', 'Call Damien'] }],
    },
    contextActionId: 'ctx-1',
    confirmation: null,
    executive: null,
    ...overrides,
  };
}

function show(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
  mockBack.mockClear();
  mockAssistant.mockReset();
  useAssistantStore.getState().reset();
  useConsent.setState({ ai: true, voice: false });
});

/** `body` with `textPage == false` and `model.turn == nil` (ios/App/AskNexdoView.swift:182-263). */
describe('the suggestions page', () => {
  it('renders the header, the tagline, five intent cards and the two entry cards', async () => {
    await show(<Ask />);

    expect(screen.getByText('Ask Nexdo')).toBeTruthy();
    expect(screen.getByText('Let’s make room for what matters.')).toBeTruthy();
    // `NexdoAIIntent.allCases`, in declaration order (AskNexdoView.swift:5).
    expect(screen.getByText('Give me my full day briefing')).toBeTruthy();
    expect(screen.getByText('Pick my Top 3 focus tasks')).toBeTruthy();
    expect(screen.getByText('Show deadlines and risks')).toBeTruthy();
    expect(screen.getByText('Find time in my schedule')).toBeTruthy();
    expect(screen.getByText('Help me plan tomorrow')).toBeTruthy();
    expect(screen.getByText('Ranked by urgency, effort, and completion risk')).toBeTruthy();
    // `entryCards` (`:277`), pinned to the bottom. No composer on this page.
    expect(screen.getByTestId('ask-entry-voice')).toBeTruthy();
    expect(screen.getByTestId('ask-entry-text')).toBeTruthy();
    expect(screen.queryByTestId('ask-field')).toBeNull();
  });

  it('opens the free-form text page from its entry card', async () => {
    await show(<Ask />);

    fireEvent.press(screen.getByTestId('ask-entry-text'));

    expect(mockPush).toHaveBeenCalledWith('/ask/text');
  });

  it('opens the voice page from its entry card', async () => {
    await show(<Ask />);

    fireEvent.press(screen.getByTestId('ask-entry-voice'));

    expect(mockPush).toHaveBeenCalledWith('/ask/voice');
  });

  it('sends the intent’s own query, not its title', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);

    fireEvent.press(screen.getByTestId('ask-intent-topFocusTasks'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalled());
    expect(mockAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: 'Pick my top 3 focus tasks, ranked by urgency, estimated effort, and completion risk.',
      }),
    );
  });
});

/** The consent gate (AskNexdoView.swift:387-391 and `consentView`, `:348-364`). */
describe('the consent gate', () => {
  beforeEach(() => useConsent.setState({ ai: false, voice: false }));

  it('holds the query and shows the sheet instead of calling the server', async () => {
    await show(<Ask />);

    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));

    await waitFor(() => expect(screen.getByText('Before using Ask AI')).toBeTruthy());
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Nexdo sends your question and relevant task and calendar information/),
    ).toBeTruthy();
  });

  it('runs the held query once sharing is allowed', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);

    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));
    await waitFor(() => expect(screen.getByTestId('ask-consent-allow')).toBeTruthy());
    fireEvent.press(screen.getByTestId('ask-consent-allow'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalled());
    expect(mockAssistant).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'Nexdo, brief me for the next 5 days.' }));
    expect(useConsent.getState().ai).toBe(true);
  });

  it('"Not now" drops the held query and sends nothing', async () => {
    await show(<Ask />);

    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));
    await waitFor(() => expect(screen.getByTestId('ask-consent-decline')).toBeTruthy());
    fireEvent.press(screen.getByTestId('ask-consent-decline'));

    await waitFor(() => expect(screen.queryByText('Before using Ask AI')).toBeNull());
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(useConsent.getState().ai).toBe(false);
  });

  /** The guard runs BEFORE the consent gate (`:380-386`), so a refusal needs no permission. */
  it('refuses a policy-blocked prompt without consent and without a request', async () => {
    mockParams = { prompt: 'Who is Ada Lovelace?' };
    await show(<AskText />);

    fireEvent.press(screen.getByTestId('ask-submit'));

    // `blockedTurn` puts the refusal in BOTH `visual.summary` and its one "AI Response" section
    // (AskNexdoView.swift:171-180), so it renders twice: the summary bar and the card.
    await waitFor(() =>
      expect(
        screen.getAllByText('I can’t help with that request. Ask me about your tasks, deadlines, or schedule instead.'),
      ).toHaveLength(2),
    );
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(screen.queryByText('Before using Ask AI')).toBeNull();
  });
});

/** `AskResponseView` (ios/App/AskResponseView.swift:11-69). */
describe('an answer', () => {
  it('shows the question, the summary and the first section previewing two items', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);

    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));

    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());
    expect(screen.getByTestId('ask-last-prompt')).toHaveTextContent('Nexdo, brief me for the next 5 days.');
    expect(screen.getByText('Three things matter today.')).toBeTruthy();
    expect(screen.getByText('TODAY')).toBeTruthy();
    expect(screen.getByText('Pack the boxes')).toBeTruthy();
    expect(screen.getByText('Ship the deck')).toBeTruthy();
    // Only the first section previews, and only two of its items.
    expect(screen.queryByText('Call Damien')).toBeNull();
    expect(screen.getByText('Show 1 more')).toBeTruthy();
  });

  it('expands and collapses a section', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);
    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));
    await waitFor(() => expect(screen.getByText('Show 1 more')).toBeTruthy());

    fireEvent.press(screen.getByText('Show 1 more'));
    await waitFor(() => expect(screen.getByText('Call Damien')).toBeTruthy());

    fireEvent.press(screen.getByText('Show less'));
    await waitFor(() => expect(screen.queryByText('Call Damien')).toBeNull());
  });

  it('a section after the first starts collapsed with the "Tap to view" hint', async () => {
    mockAssistant.mockResolvedValue(
      turn({
        visual: {
          summary: 'Two groups.',
          sections: [
            { title: 'Today', items: ['Pack the boxes'] },
            { title: 'Overdue', items: ['Ship the deck'] },
          ],
        },
      }),
    );
    await show(<Ask />);
    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));

    await waitFor(() => expect(screen.getByText('OVERDUE')).toBeTruthy());
    expect(screen.getByText('Tap to view the details.')).toBeTruthy();
    expect(screen.queryByText('Ship the deck')).toBeNull();
  });

  it('"Show suggestions" throws the turn away and brings the cards back', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);
    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));
    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());

    fireEvent.press(screen.getByTestId('ask-show-suggestions'));

    await waitFor(() => expect(screen.queryByTestId('ask-summary')).toBeNull());
    expect(screen.getByText('Give me my full day briefing')).toBeTruthy();
    expect(useAssistantStore.getState().turn).toBeNull();
    // The thread handle survives; only the answer is cleared.
    expect(useAssistantStore.getState().contextId).toBe('ctx-1');
  });

  it('shows the failure line and retries the same query', async () => {
    mockAssistant.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(turn());
    await show(<Ask />);

    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));
    await waitFor(() => expect(screen.getByTestId('ask-failed')).toBeTruthy());
    expect(screen.getByText('Nexdo couldn’t complete that request. Please try again.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('ask-retry'));
    await waitFor(() => expect(mockAssistant).toHaveBeenCalledTimes(2));
    expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: 'Nexdo, brief me for the next 5 days.' }));
  });

  it('the close button clears the answer and dismisses', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);
    fireEvent.press(screen.getByTestId('ask-intent-dailyBriefing'));
    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());

    fireEvent.press(screen.getByTestId('ask-close'));

    expect(useAssistantStore.getState().turn).toBeNull();
    expect(mockBack).toHaveBeenCalled();
  });
});

/** The confirmation card (AskResponseView.swift:47-65). */
describe('a proposal', () => {
  const PROPOSAL = turn({
    confirmation: { actionId: 'act-9', prompt: 'Move two tasks to tomorrow?' },
    executive: {
      proposedScheduleChanges: [
        { taskId: 't1', title: 'Pack boxes', before: null, after: 'Tomorrow 10:00', durationMin: 30, reason: 'Frees this evening' },
      ],
    },
  });

  it('shows the prompt and each proposed change', async () => {
    mockAssistant.mockResolvedValue(PROPOSAL);
    await show(<Ask />);
    fireEvent.press(screen.getByTestId('ask-intent-planTomorrow'));

    await waitFor(() => expect(screen.getByTestId('ask-confirmation')).toBeTruthy());
    expect(screen.getByText('REVIEW PROPOSED CHANGES')).toBeTruthy();
    expect(screen.getByText('Move two tasks to tomorrow?')).toBeTruthy();
    expect(screen.getByText('Pack boxes')).toBeTruthy();
    // `before` is nil, so Swift prints "Unscheduled".
    expect(screen.getByText('From: Unscheduled')).toBeTruthy();
    expect(screen.getByText('To: Tomorrow 10:00 · 30 min')).toBeTruthy();
    expect(screen.getByText('Frees this evening')).toBeTruthy();
  });

  it('approving posts confirmActionId with the transcript "yes"', async () => {
    mockAssistant.mockResolvedValueOnce(PROPOSAL).mockResolvedValueOnce(turn());
    await show(<Ask />);
    fireEvent.press(screen.getByTestId('ask-intent-planTomorrow'));
    await waitFor(() => expect(screen.getByTestId('ask-approve')).toBeTruthy());

    fireEvent.press(screen.getByTestId('ask-approve'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalledTimes(2));
    expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: 'yes', confirmActionId: 'act-9' }));
  });

  it('declining posts rejectActionId with the transcript "no"', async () => {
    mockAssistant.mockResolvedValueOnce(PROPOSAL).mockResolvedValueOnce(turn());
    await show(<Ask />);
    fireEvent.press(screen.getByTestId('ask-intent-planTomorrow'));
    await waitFor(() => expect(screen.getByTestId('ask-reject')).toBeTruthy());

    fireEvent.press(screen.getByTestId('ask-reject'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalledTimes(2));
    expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: 'no', rejectActionId: 'act-9' }));
  });
});

/** `textPage == true` (AskNexdoView.swift:215-228 and `composer`, `:312-333`). */
describe('the free-form text page', () => {
  it('renders its own title, the field, the controls and the three examples', async () => {
    await show(<AskText />);

    expect(screen.getByText('Free form Text')).toBeTruthy();
    expect(screen.getByText('What would you like help with?')).toBeTruthy();
    expect(screen.getByText('Type a question or tell Nexdo what to plan, create, or change.')).toBeTruthy();
    expect(screen.getByTestId('ask-field')).toBeTruthy();
    expect(screen.getByText('Try a prompt')).toBeTruthy();
    expect(screen.getByText('What should I focus on today?')).toBeTruthy();
    expect(screen.getByText('Find 30 minutes free tomorrow for a walk.')).toBeTruthy();
    expect(screen.getByText('Remind me to call Damien tomorrow at 11 AM.')).toBeTruthy();
    // No entry cards, and no mic in the controls, on this page.
    expect(screen.queryByTestId('ask-entry-voice')).toBeNull();
    expect(screen.queryByTestId('ask-mic')).toBeNull();
  });

  it('an example fills the field without sending it', async () => {
    await show(<AskText />);

    fireEvent.press(screen.getByText('Find 30 minutes free tomorrow for a walk.'));

    await waitFor(() => expect(screen.getByTestId('ask-field').props.value).toBe('Find 30 minutes free tomorrow for a walk.'));
    expect(mockAssistant).not.toHaveBeenCalled();
  });

  it('sends what was typed and clears the field', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<AskText />);

    fireEvent.changeText(screen.getByTestId('ask-field'), 'Find 30 minutes free tomorrow for a walk.');
    await waitFor(() => expect(screen.getByTestId('ask-field').props.value).toBe('Find 30 minutes free tomorrow for a walk.'));
    fireEvent.press(screen.getByTestId('ask-submit'));

    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());
    expect(mockAssistant).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'Find 30 minutes free tomorrow for a walk.' }));
    expect(screen.getByTestId('ask-field').props.value).toBe('');
  });

  /**
   * `validPrompt` (AskNexdoView.swift:149). The "Keep your question under 4,000 characters." line
   * lives in `composer` (`:329-331`), which only exists once there is an answer, so the first page
   * shows no warning — it just refuses to send.
   */
  it('refuses to send past 4,000 characters', async () => {
    await show(<AskText />);

    fireEvent.changeText(screen.getByTestId('ask-field'), 'x'.repeat(4001));
    await waitFor(() => expect(screen.getByTestId('ask-field').props.value).toHaveLength(4001));

    fireEvent.press(screen.getByTestId('ask-submit'));

    expect(screen.getByTestId('ask-submit').props.accessibilityState).toMatchObject({ disabled: true });
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(screen.queryByTestId('ask-too-long')).toBeNull();
  });

  /** "Plan next week" (app/today/weekly-summary.tsx) opens Ask with the prompt already typed. */
  it('starts with a prefilled prompt without sending it', async () => {
    mockParams = { prompt: 'Plan my next week around these commitments.' };
    await show(<AskText />);

    expect(screen.getByTestId('ask-field').props.value).toBe('Plan my next week around these commitments.');
    expect(mockAssistant).not.toHaveBeenCalled();
  });
});
