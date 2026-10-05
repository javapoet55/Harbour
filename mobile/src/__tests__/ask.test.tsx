import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AssistantTurn, NexdoTask } from '../api';
import { useAssistantStore } from '../store/assistant';
import { useConsent } from '../store/consent';
import { useSession } from '../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
}));

const mockAssistant = jest.fn();
const mockTasks = jest.fn();
const mockRecommend = jest.fn();
jest.mock('../api/shopping', () => ({
  ...jest.requireActual('../api/shopping'),
  shoppingStoresApi: { search: jest.fn(), brand: jest.fn(), recognize: jest.fn(), recommendations: (...args: unknown[]) => mockRecommend(...args) },
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    assistant: (...args: unknown[]) => mockAssistant(...args),
    tasks: (...args: unknown[]) => mockTasks(...args),
  },
}));

import Ask from '../../app/ask/index';
import { AskNexdoView } from '../components/AskNexdoView';
import { briefHandlers } from '../features/ask/briefHandlers';

const BRIEFING = 'Give me my full day briefing for today: priorities, deadlines, conflicts, and my next move.';
const TOP_THREE = 'Pick my top 3 focus tasks, ranked by urgency, estimated effort, and impact.';
const FREE_FORM = 'What should I focus on today?';

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

/** Swift's `-daily-brief-design-preview` fixture (RootView.swift:38-42), plus lines the brief must drop. */
const BRIEF = turn({
  visual: {
    summary: 'Your daily brief',
    sections: [
      { title: 'Top priorities', items: ['Contact gutter technician is overdue. Tackle it first.', 'Review the plumbing quote.', 'none detected'] },
      { title: 'Calendar freshness', items: ['Synced two minutes ago.'] },
      { title: 'Deadlines', items: ['Send the report by 4 PM.'] },
      { title: 'Conflicts and risks', items: ['No conflicts detected today.'] },
      { title: 'Next move', items: ['Call the gutter technician now.'] },
    ],
  },
});

const GUTTER: NexdoTask = { id: 'brief-preview', title: 'Contact gutter technician', status: 'PLANNED', priority: 'HIGH', durationMin: 30 };

function show(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

/** Types into the landing's "Or type your request…" field and sends it. */
async function askTyped(text: string) {
  await fireEvent.changeText(screen.getByTestId('ask-landing-field'), text);
  await fireEvent.press(screen.getByTestId('ask-send'));
}

beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
  mockBack.mockClear();
  mockAssistant.mockReset();
  mockRecommend.mockReset();
  mockTasks.mockReset();
  mockTasks.mockResolvedValue({ tasks: [GUTTER], timeZone: 'UTC' });
  useAssistantStore.getState().reset();
  useConsent.setState({ ai: true, voice: false });
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', timeZone: 'UTC' } });
});

/** `AskAILandingView` (ios/App/AskAILandingView.swift), Ask's first page. */
describe('the Ask AI landing', () => {
  it('greets by first name and shows the four shortened briefing cards, voice and the request field', async () => {
    await show(<Ask />);

    expect(screen.getByText('Nexdo')).toBeTruthy();
    expect(screen.getByText('Your AI productivity companion')).toBeTruthy();
    expect(screen.getByText('Hi Ada,')).toBeTruthy();
    expect(screen.getByText('How can I help you today?')).toBeTruthy();
    expect(screen.getByText('Plan smarter. Do more. Stress less.')).toBeTruthy();
    expect(['My Daily Brief', 'Top 3 Tasks', 'Due & Risks', 'Find Time'].map((title) => screen.getByText(title))).toHaveLength(4);
    expect(screen.getByText('Due in the\nnext 5 days')).toBeTruthy();
    expect(screen.queryByTestId('ask-card-4')).toBeNull();
    expect(screen.getByText('Tap and speak naturally. I’m listening…')).toBeTruthy();
    expect(screen.getByTestId('ask-landing-field').props.placeholder).toBe('Or type your request…');
    expect(screen.getByText('Powered by Nexdo AI')).toBeTruthy();
    // The old page is gone: no "Ask Nexdo" header, tagline, intent list or entry cards.
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.queryByText('Let’s make room for what matters.')).toBeNull();
    expect(screen.queryByText('Help me plan tomorrow')).toBeNull();
    expect(screen.queryByTestId('ask-entry-text')).toBeNull();
    expect(screen.queryByTestId('ask-field')).toBeNull();
  });

  it('says "there" when the profile has no name', async () => {
    useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: '', email: 'ada@example.com', timeZone: 'UTC' } });
    await show(<Ask />);
    expect(screen.getByText('Hi there,')).toBeTruthy();
  });

  it('each card sends its intent’s query, not its title', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);

    await fireEvent.press(screen.getByTestId('ask-card-1'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalled());
    expect(mockAssistant).toHaveBeenCalledWith(expect.objectContaining({ transcript: TOP_THREE }));
  });

  it('"Ask by Voice" opens the voice page; close dismisses', async () => {
    await show(<Ask />);

    await fireEvent.press(screen.getByTestId('ask-voice'));
    expect(mockPush).toHaveBeenCalledWith('/ask/voice');

    await fireEvent.press(screen.getByLabelText('Close Ask Nexdo'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('send waits for text and refuses past 4,000 characters with its warning', async () => {
    await show(<Ask />);
    expect(screen.getByTestId('ask-send').props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(screen.getByTestId('ask-landing-field'), 'x'.repeat(4001));

    expect(screen.getByTestId('ask-landing-too-long')).toHaveTextContent('Keep your request under 4,000 characters.');
    expect(screen.getByTestId('ask-send').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('ask-send'));
    expect(mockAssistant).not.toHaveBeenCalled();
  });

  /** "Plan next week" (app/today/weekly-summary.tsx) opens Ask with the prompt already typed. */
  it('starts with a prefilled prompt without sending it', async () => {
    mockParams = { prompt: 'Plan my next week around these commitments.' };
    await show(<Ask />);

    expect(screen.getByTestId('ask-landing-field').props.value).toBe('Plan my next week around these commitments.');
    expect(mockAssistant).not.toHaveBeenCalled();
  });

  it('shows "Working on it…" over the page while a request runs', async () => {
    let resolve: (value: AssistantTurn) => void = () => undefined;
    mockAssistant.mockReturnValue(new Promise<AssistantTurn>((done) => (resolve = done)));
    await show(<Ask />);

    await askTyped(FREE_FORM);

    await waitFor(() => expect(screen.getByTestId('ask-working')).toHaveTextContent('Working on it…'));
    resolve(turn());
    await waitFor(() => expect(screen.queryByTestId('ask-working')).toBeNull());
  });

  it('the keyboard "Done" bar appears while typing', async () => {
    await show(<Ask />);
    await fireEvent(screen.getByTestId('ask-landing-field'), 'focus');
    await fireEvent.press(screen.getByTestId('ask-keyboard-done'));
    expect(screen.queryByTestId('ask-keyboard-done')).toBeNull();
  });
});

/** The consent gate (AskNexdoView.swift:498-502 and `consentView`, `:468-484`). */
describe('the consent gate', () => {
  beforeEach(() => useConsent.setState({ ai: false, voice: false }));

  it('holds the query and shows the sheet instead of calling the server', async () => {
    await show(<Ask />);

    await fireEvent.press(screen.getByTestId('ask-card-0'));

    await waitFor(() => expect(screen.getByText('Before using Ask AI')).toBeTruthy());
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(screen.getByText(/Nexdo sends your question and relevant task and calendar information/)).toBeTruthy();
  });

  it('runs the held query once sharing is allowed', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);

    await fireEvent.press(screen.getByTestId('ask-card-0'));
    await waitFor(() => expect(screen.getByTestId('ask-consent-allow')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('ask-consent-allow'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalled());
    expect(mockAssistant).toHaveBeenCalledWith(expect.objectContaining({ transcript: BRIEFING }));
    expect(useConsent.getState().ai).toBe(true);
  });

  it('"Not now" drops the held query and sends nothing', async () => {
    await show(<Ask />);

    await fireEvent.press(screen.getByTestId('ask-card-0'));
    await waitFor(() => expect(screen.getByTestId('ask-consent-decline')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('ask-consent-decline'));

    await waitFor(() => expect(screen.queryByText('Before using Ask AI')).toBeNull());
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(useConsent.getState().ai).toBe(false);
  });

  /** The guard runs BEFORE the consent gate (`:490-497`), so a refusal needs no permission. */
  it('refuses a policy-blocked prompt without consent and without a request', async () => {
    await show(<Ask />);

    await askTyped('Who is Ada Lovelace?');

    // `blockedTurn` puts the refusal in BOTH `visual.summary` and its one "AI Response" section.
    await waitFor(() =>
      expect(screen.getAllByText('I can’t help with that request. Ask me about your tasks, deadlines, or schedule instead.')).toHaveLength(2),
    );
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(screen.queryByText('Before using Ask AI')).toBeNull();
  });
});

/** `AskResponseView` (ios/App/AskResponseView.swift:11-69): any turn that is not a briefing. */
describe('an answer', () => {
  it('shows the header, the question, the summary and the first section previewing two items', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);

    await askTyped(FREE_FORM);

    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());
    expect(screen.getByRole('header', { name: 'Ask Nexdo' })).toBeTruthy();
    expect(screen.getByTestId('ask-last-prompt')).toHaveTextContent(FREE_FORM);
    expect(screen.getByText('Three things matter today.')).toBeTruthy();
    expect(screen.getByText('TODAY')).toBeTruthy();
    expect(screen.getByText('Pack the boxes')).toBeTruthy();
    expect(screen.getByText('Ship the deck')).toBeTruthy();
    expect(screen.queryByText('Call Damien')).toBeNull();
    expect(screen.getByText('Show 1 more')).toBeTruthy();
    // The composer is back once there is an answer, and the landing field is gone.
    expect(screen.getByTestId('ask-field')).toBeTruthy();
    expect(screen.queryByTestId('ask-landing-field')).toBeNull();
  });

  it('expands and collapses a section', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);
    await askTyped(FREE_FORM);
    await waitFor(() => expect(screen.getByText('Show 1 more')).toBeTruthy());

    await fireEvent.press(screen.getByText('Show 1 more'));
    await waitFor(() => expect(screen.getByText('Call Damien')).toBeTruthy());

    await fireEvent.press(screen.getByText('Show less'));
    await waitFor(() => expect(screen.queryByText('Call Damien')).toBeNull());
  });

  it('a section after the first starts collapsed with the "Tap to view" hint', async () => {
    mockAssistant.mockResolvedValue(
      turn({ visual: { summary: 'Two groups.', sections: [{ title: 'Today', items: ['Pack the boxes'] }, { title: 'Overdue', items: ['Ship the deck'] }] } }),
    );
    await show(<Ask />);
    await askTyped(FREE_FORM);

    await waitFor(() => expect(screen.getByText('OVERDUE')).toBeTruthy());
    expect(screen.getByText('Tap to view the details.')).toBeTruthy();
    expect(screen.queryByText('Ship the deck')).toBeNull();
  });

  it('"Show suggestions" throws the turn away and brings the landing back', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);
    await askTyped(FREE_FORM);
    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('ask-show-suggestions'));

    await waitFor(() => expect(screen.queryByTestId('ask-summary')).toBeNull());
    expect(screen.getByText('My Daily Brief')).toBeTruthy();
    expect(useAssistantStore.getState().turn).toBeNull();
    expect(useAssistantStore.getState().contextId).toBe('ctx-1');
  });

  it('sends a follow-up from the composer and clears it', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);
    await askTyped(FREE_FORM);
    await waitFor(() => expect(screen.getByTestId('ask-field')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('ask-field'), 'Find 30 minutes free tomorrow for a walk.');
    await fireEvent.press(screen.getByTestId('ask-submit'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalledTimes(2));
    expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: 'Find 30 minutes free tomorrow for a walk.' }));
    await waitFor(() => expect(screen.getByTestId('ask-field').props.value).toBe(''));
  });

  it('shows the failure line and retries the same query', async () => {
    mockAssistant.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(turn());
    await show(<Ask />);

    await fireEvent.press(screen.getByTestId('ask-card-0'));
    await waitFor(() => expect(screen.getByTestId('ask-failed')).toBeTruthy());
    expect(screen.getByText('Nexdo couldn’t complete that request. Please try again.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('ask-retry'));
    await waitFor(() => expect(mockAssistant).toHaveBeenCalledTimes(2));
    expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: BRIEFING }));
  });

  it('the close button clears the answer and dismisses', async () => {
    mockAssistant.mockResolvedValue(turn());
    await show(<Ask />);
    await askTyped(FREE_FORM);
    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('ask-close'));

    expect(useAssistantStore.getState().turn).toBeNull();
    expect(mockBack).toHaveBeenCalled();
  });
});

/** `DailyBriefView` (ios/App/DailyBriefView.swift), shown for the four briefing queries. */
describe('the Daily Brief', () => {
  async function openBrief(card = 0, answer: AssistantTurn = BRIEF) {
    mockAssistant.mockResolvedValue(answer);
    await show(<Ask />);
    await waitFor(() => expect(mockTasks).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId(`ask-card-${card}`));
    await waitFor(() => expect(screen.getByTestId('daily-brief')).toBeTruthy());
  }

  it('greets, introduces the brief and shows only the useful sections, restyled', async () => {
    await openBrief();

    expect(screen.getByText('Hi Ada 👋')).toBeTruthy();
    expect(screen.getByText('Here’s what you need to know today.')).toBeTruthy();
    expect(screen.getByTestId('brief-introduction')).toHaveTextContent('Here’s your quick briefing for today, Ada. Focus on what matters most.');
    expect(screen.getByLabelText('Nexdo. Get more done with AI')).toBeTruthy();
    // Freshness and "no conflicts" go; a priority line stays only when it names an open task.
    await waitFor(() => expect(screen.getByText('Top Priorities')).toBeTruthy());
    expect(screen.getAllByTestId(/^brief-section-/)).toHaveLength(3);
    expect(screen.getByText('Upcoming Deadlines')).toBeTruthy();
    expect(screen.getByText('Next Move')).toBeTruthy();
    expect(screen.queryByText('Conflicts & Risks')).toBeNull();
    expect(screen.queryByText(/Calendar Freshness/i)).toBeNull();
    expect(screen.queryByText('Review the plumbing quote.')).toBeNull();
    expect(screen.getByText('Contact gutter technician is overdue. Tackle it first.')).toBeTruthy();
    // No answer header, no composer.
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.queryByTestId('ask-field')).toBeNull();
    expect(screen.queryByTestId('ask-close')).toBeNull();
  });

  it('a section card opens its page', async () => {
    await openBrief();
    await waitFor(() => expect(screen.getByText('Top Priorities')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('brief-section-1'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/ask/brief/[index]', params: { index: '1', title: 'Upcoming Deadlines' } });
    expect(screen.getByTestId('brief-section-1').props.accessibilityHint).toBe('Opens Upcoming Deadlines');
  });

  it('close returns to the landing and forgets the prompt, without leaving Ask', async () => {
    await openBrief();
    await fireEvent.changeText(screen.getByTestId('brief-field'), 'half typed');

    await fireEvent.press(screen.getByLabelText('Close daily brief'));

    expect(screen.getByTestId('ask-landing')).toBeTruthy();
    expect(screen.getByTestId('ask-landing-field').props.value).toBe('');
    expect(useAssistantStore.getState().turn).toBeNull();
    expect(useAssistantStore.getState().lastAssistantPrompt).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('uses each intent’s own title and copy', async () => {
    await openBrief(1, turn({ visual: { summary: 'x', sections: [{ title: 'Top priorities', items: ['Contact gutter technician — overdue'] }] } }));

    expect(screen.getByLabelText('Close Top 3 Tasks')).toBeTruthy();
    expect(screen.getByText('Here’s where to focus your effort.')).toBeTruthy();
    expect(screen.getByTestId('brief-introduction')).toHaveTextContent('Your focus recommendations, Ada. Prioritize what matters most.');
  });

  it('says so when nothing is left to show', async () => {
    await openBrief(2, turn({ visual: { summary: 'x', sections: [{ title: 'Conflicts', items: ['No schedule conflicts found.'] }] } }));

    expect(screen.getByLabelText('Close Due & Risks')).toBeTruthy();
    expect(screen.getByTestId('brief-empty')).toHaveTextContent('Nothing needs your attention here right now.');
  });

  it('the chips send their queries; the field sends what was typed and shows a plain answer', async () => {
    await openBrief();

    await fireEvent.press(screen.getByTestId('brief-suggestion-topFocusTasks'));
    await waitFor(() => expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: TOP_THREE })));

    mockAssistant.mockResolvedValue(turn());
    expect(screen.queryByTestId('brief-send')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('brief-field'), FREE_FORM);
    await fireEvent.press(screen.getByTestId('brief-send'));

    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());
    expect(screen.queryByTestId('daily-brief')).toBeNull();
    expect(screen.getByRole('header', { name: 'Ask Nexdo' })).toBeTruthy();
  });

  it('the mic opens voice', async () => {
    await openBrief();
    await fireEvent.press(screen.getByLabelText('Ask by voice'));
    expect(mockPush).toHaveBeenCalledWith('/ask/voice');
  });

  it('a briefing that needs confirmation stays a plain answer', async () => {
    await show(<Ask />);
    mockAssistant.mockResolvedValue(turn({ confirmation: { actionId: 'act-1', prompt: 'Move it?' } }));
    await fireEvent.press(screen.getByTestId('ask-card-0'));
    await waitFor(() => expect(screen.getByTestId('ask-confirmation')).toBeTruthy());
    expect(screen.queryByTestId('daily-brief')).toBeNull();
  });

  it('lets a section page ask through it', async () => {
    await openBrief();
    mockAssistant.mockResolvedValue(turn());

    briefHandlers()?.ask('Help me with these upcoming deadlines:\nSend the report by 4 PM.');

    await waitFor(() => expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: 'Help me with these upcoming deadlines:\nSend the report by 4 PM.' })));
  });
});

/** The confirmation card (AskResponseView.swift:47-65). */
describe('a proposal', () => {
  const PROPOSAL = turn({
    confirmation: { actionId: 'act-9', prompt: 'Move two tasks to tomorrow?' },
    executive: {
      proposedScheduleChanges: [{ taskId: 't1', title: 'Pack boxes', before: null, after: 'Tomorrow 10:00', durationMin: 30, reason: 'Frees this evening' }],
    },
  });
  const PLAN = 'Plan tomorrow for me.';

  it('shows the prompt and each proposed change', async () => {
    mockAssistant.mockResolvedValue(PROPOSAL);
    await show(<Ask />);
    await askTyped(PLAN);

    await waitFor(() => expect(screen.getByTestId('ask-confirmation')).toBeTruthy());
    expect(screen.getByText('REVIEW PROPOSED CHANGES')).toBeTruthy();
    expect(screen.getByText('Move two tasks to tomorrow?')).toBeTruthy();
    expect(screen.getByText('Pack boxes')).toBeTruthy();
    expect(screen.getByText('From: Unscheduled')).toBeTruthy();
    expect(screen.getByText('To: Tomorrow 10:00 · 30 min')).toBeTruthy();
    expect(screen.getByText('Frees this evening')).toBeTruthy();
  });

  it('approving posts confirmActionId with the transcript "yes"', async () => {
    mockAssistant.mockResolvedValueOnce(PROPOSAL).mockResolvedValueOnce(turn());
    await show(<Ask />);
    await askTyped(PLAN);
    await waitFor(() => expect(screen.getByTestId('ask-approve')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('ask-approve'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalledTimes(2));
    expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: 'yes', confirmActionId: 'act-9' }));
  });

  it('declining posts rejectActionId with the transcript "no"', async () => {
    mockAssistant.mockResolvedValueOnce(PROPOSAL).mockResolvedValueOnce(turn());
    await show(<Ask />);
    await askTyped(PLAN);
    await waitFor(() => expect(screen.getByTestId('ask-reject')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('ask-reject'));

    await waitFor(() => expect(mockAssistant).toHaveBeenCalledTimes(2));
    expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: 'no', rejectActionId: 'act-9' }));
  });
});

/**
 * Shopping Recommendations: `AskNexdoView(textPage: true, shoppingContext:)`, presented as a sheet from
 * Shopping Detail (ShoppingViews.swift:381).
 */
describe('Shopping Recommendations', () => {
  const CONTEXT = { listName: 'Parity Run D List', itemNames: ['whole milk', 'eggs', 'bananas'] };

  it('renders its title, the intro card, the shopping field and button, and four prompts with icons', async () => {
    const onClose = jest.fn();
    await show(<AskNexdoView textPage shoppingContext={CONTEXT} onClose={onClose} />);

    expect(screen.getByRole('header', { name: 'Shopping Recommendations' })).toBeTruthy();
    expect(screen.queryByText('What would you like help with?')).toBeNull();
    expect(screen.queryByTestId('ask-landing')).toBeNull();
    expect(screen.getByText('Plan a smarter cart')).toBeTruthy();
    expect(screen.getByTestId('shopping-recommendations-list').props.children).toBe('Parity Run D List');
    expect(
      screen.getByText('Ask Nexdo to spot missing staples, suggest meal ideas, compare alternatives, or check quantities using the items already on this list.'),
    ).toBeTruthy();
    expect(screen.getByText('Suggestions only—your list changes after you approve them.')).toBeTruthy();
    expect(screen.getByTestId('ask-field').props.placeholder).toBe('Ask about this shopping list…');
    expect(screen.getByText('Get Recommendations')).toBeTruthy();
    expect(screen.getByLabelText('Get shopping recommendations').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Try asking about your list')).toBeTruthy();
    expect(screen.getByTestId('ask-example-icon-basket.fill')).toBeTruthy();
    expect(screen.getByTestId('ask-example-icon-fork.knife')).toBeTruthy();
    expect(screen.getByTestId('ask-example-icon-dollarsign.circle')).toBeTruthy();
    expect(screen.getByTestId('ask-example-icon-number.circle')).toBeTruthy();
    expect(screen.getByText('Check whether these quantities look right for one week.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('ask-close'));
    expect(onClose).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  /** `askShopping(_:context:)` (NexdoApp.swift:804-814): its own endpoint, not an `/api/assistant` prompt. */
  it('asks POST /api/shopping/recommendations with the list, and shows the words typed as the question', async () => {
    mockRecommend.mockResolvedValue(turn({ contextActionId: 'should-not-stick', visual: { summary: 'Try these.', sections: [{ title: 'Shopping suggestions', items: ['Add rice'] }] } }));
    await show(<AskNexdoView textPage shoppingContext={CONTEXT} onClose={jest.fn()} />);

    await fireEvent.press(screen.getByText('Suggest groceries for three balanced dinners.'));
    expect(screen.getByTestId('ask-field').props.value).toBe('Suggest groceries for three balanced dinners.');
    expect(mockRecommend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Get shopping recommendations'));

    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());
    expect(mockRecommend).toHaveBeenCalledWith({ prompt: 'Suggest groceries for three balanced dinners.', listName: 'Parity Run D List', itemNames: ['whole milk', 'eggs', 'bananas'] });
    expect(mockAssistant).not.toHaveBeenCalled();
    expect(screen.getByTestId('ask-last-prompt').props.children).toBe('Suggest groceries for three balanced dinners.');
    // `contextID = nil`: a recommendation starts no assistant thread.
    expect(useAssistantStore.getState().contextId).toBeNull();
    // No bottom composer after an answer in shopping mode (:333).
    expect(screen.queryAllByTestId('ask-field')).toHaveLength(0);
  });

  it('lets a shopping question through the general-knowledge guard, and shows a failure with Retry', async () => {
    mockRecommend.mockRejectedValueOnce(new Error('Shopping recommendations did not finish. Please try again.')).mockResolvedValueOnce(turn());
    await show(<AskNexdoView textPage shoppingContext={CONTEXT} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText('What practical essentials are missing from this list?'));
    await fireEvent.press(screen.getByLabelText('Get shopping recommendations'));
    await waitFor(() => expect(screen.getByTestId('ask-failed')).toBeTruthy());
    expect(mockRecommend).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('ask-retry'));
    await waitFor(() => expect(screen.getByTestId('ask-summary')).toBeTruthy());
  });
});
