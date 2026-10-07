import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import * as SMS from 'expo-sms';
import { Alert, Linking } from 'react-native';

import { useCoordinator } from '../actions/coordinator';
import { ApiError } from '../api/client';
import type { TaskAgentCandidate, TaskAgentEnvelope, TaskAgentRun } from '../api/taskAgent';
import type { StoredTaskAction } from '../lib/taskAction';
import { capitalizedWords, inlineWarnings, reviewCountText, runControls, stars, statusTitle } from '../lib/taskAgent';
import { useSession } from '../store/session';
import { TaskAgentCard } from './TaskAgentCard';

/**
 * `TaskAgentCard` (ios/App/TaskAgentCard.swift). The API is mocked; nothing here reaches the network,
 * and "Open in Messages" goes to the jest.setup `expo-sms` mock — no message is ever sent.
 */

const mockLoad = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../api/taskAgent', () => ({
  taskAgentApi: {
    load: (...args: unknown[]) => mockLoad(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));
jest.mock('../config', () => ({ getApiUrl: () => 'https://api.example.test' }));

function run(overrides: Partial<TaskAgentRun> = {}): TaskAgentRun {
  return {
    id: 'r1',
    status: 'NEEDS_INPUT',
    version: 3,
    service: 'plumber',
    urgency: 'flexible',
    slots: { location: '', budget: '', constraints: '' },
    steps: [],
    candidates: [],
    warnings: [],
    question: { key: 'location', text: 'Which city or ZIP code should I search?' },
    error: null,
    ...overrides,
  };
}

function candidate(id: string, overrides: Partial<TaskAgentCandidate> = {}): TaskAgentCandidate {
  return {
    id,
    googlePlaceId: `place-${id}`,
    name: `Business ${id}`,
    address: '3494 Camino Tassajara #108, Danville, CA 94506, USA',
    phone: '(925) 567-9000',
    website: 'https://example.com',
    reason: 'Confirm services, licensing, price, and availability with the business.',
    draft: `Hello ${id}, could you provide a quote?`,
    evidence: [{ source: 'Google', url: 'https://maps.google.com/?cid=1', rating: 4.9, reviews: 1403 }],
    feedback: [{ author: 'Sample reviewer', url: `https://maps.google.com/review-${id}`, rating: 5, published: 'a month ago', text: 'Arrived on time.' }],
    attributions: [],
    ...overrides,
  };
}

const ready = (overrides: Partial<TaskAgentRun> = {}) =>
  run({ status: 'READY_FOR_REVIEW', question: null, slots: { location: '94582', budget: '', constraints: '' }, candidates: [candidate('0'), candidate('1')], ...overrides });

function envelope(value: TaskAgentRun | null, intent: TaskAgentEnvelope['intent'] = null): TaskAgentEnvelope {
  return { run: value, intent };
}

function storedAction(overrides: Partial<StoredTaskAction> = {}): StoredTaskAction {
  return {
    id: 'a1',
    taskId: 't1',
    contactName: 'Plumber',
    status: 'pending',
    sourceTitle: 'Call a plumber',
    type: 'call',
    contactIdentifier: 'contact-9',
    manualRecipient: { name: 'Typed', phone: '555', email: '' } as StoredTaskAction['manualRecipient'],
    businessCandidateID: null,
    ...overrides,
  };
}

async function renderCard(onResearchAvailable = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <TaskAgentCard taskId="t1" onResearchAvailable={onResearchAvailable} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockLoad).toHaveBeenCalledWith('t1'));
  return { onResearchAvailable, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: 'UTC' } });
  useCoordinator.getState().reset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.mocked(SMS.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(SMS.sendSMSAsync).mockResolvedValue({ result: 'sent' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('status titles (TaskAgentCard.swift:33-45)', () => {
  it.each([
    ['NEEDS_INPUT', 'One detail before I start'],
    ['QUEUED', 'Research queued'],
    ['RUNNING', 'NexDo is working on this'],
    ['PAUSED', 'Research paused'],
    ['BLOCKED', 'Search connections needed'],
    ['READY_FOR_REVIEW', 'Shortlist and drafts ready'],
    ['NO_RESULTS', 'No matching providers found'],
    ['CANCELLED', 'Research cancelled'],
    ['FAILED', 'Research needs a retry'],
  ])('%s reads “%s”', (status, title) => {
    expect(statusTitle(status)).toBe(title);
  });

  it('renders the header with the service and a missing location', async () => {
    mockLoad.mockResolvedValue(envelope(run({ service: 'electrician', status: 'PAUSED', question: null })));
    await renderCard();
    expect(await screen.findByText('Research paused')).toBeTruthy();
    expect(screen.getByText('AI ASSISTANT')).toBeTruthy();
    expect(screen.getByText('Electrician · Location needed')).toBeTruthy();
  });
});

describe('the controls row (TaskAgentCard.swift:99-103)', () => {
  it.each([
    ['QUEUED', ['Pause', 'Cancel search']],
    ['RUNNING', ['Pause', 'Cancel search']],
    ['PAUSED', ['Resume', 'Cancel search']],
    ['FAILED', ['Retry', 'Cancel search']],
    ['BLOCKED', ['Retry', 'Cancel search']],
    ['NEEDS_INPUT', ['Cancel search']],
    ['READY_FOR_REVIEW', []],
    ['NO_RESULTS', ['Search again']],
    ['CANCELLED', ['Search again']],
  ])('%s offers %j', (status, titles) => {
    expect(runControls(status).map((control) => control.title)).toEqual(titles);
  });

  it('shows the spinner and Pause while running, and pauses', async () => {
    mockLoad.mockResolvedValue(envelope(run({ status: 'RUNNING', question: null, slots: { location: '94109', budget: '', constraints: '' } })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'PAUSED', question: null })));
    await renderCard();
    expect(await screen.findByLabelText('Pause')).toBeTruthy();
    expect(screen.getByText('Finding the best business near your place…')).toBeTruthy();
    expect(screen.getByText('NexDo is working on this')).toBeTruthy();
    expect(screen.queryByText('Resume')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Pause'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'pause', version: 3 })));
    expect(await screen.findByText('Research paused')).toBeTruthy();
    expect(screen.getByLabelText('Resume')).toBeTruthy();
  });

  it('an action does not fire an extra load: the update answers the new run', async () => {
    mockLoad.mockResolvedValue(envelope(run()));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'QUEUED', version: 4, question: null, slots: { location: '94109', budget: '', constraints: '' } })));
    await renderCard();
    await fireEvent.changeText(await screen.findByLabelText('City or ZIP code'), '94109');
    await fireEvent.press(screen.getByTestId('agent-search'));
    expect(await screen.findByText('Research queued')).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it.each(['NO_RESULTS', 'CANCELLED'])('a %s run offers Search again in the last area, which starts a new search', async (status) => {
    mockLoad.mockResolvedValue(envelope(run({ status, question: null, slots: { location: '94109', budget: '', constraints: '' } })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'QUEUED', version: 4, question: null, slots: { location: '94109', budget: '', constraints: '' } })));
    await renderCard();
    expect((await screen.findByLabelText('City or ZIP code')).props.value).toBe('94109');
    await fireEvent.press(screen.getByLabelText('Search again'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'search', version: 3, answer: '94109' })));
    expect(await screen.findByText('Research queued')).toBeTruthy();
  });

  it('from a NO_RESULTS run, Search again searches the area typed in its place', async () => {
    mockLoad.mockResolvedValue(envelope(run({ status: 'NO_RESULTS', question: null, slots: { location: 'Qzxqv Nowhere', budget: '', constraints: '' } })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'QUEUED', version: 4, question: null, slots: { location: '10001', budget: '', constraints: '' } })));
    await renderCard();
    const field = await screen.findByLabelText('City or ZIP code');
    expect(field.props.value).toBe('Qzxqv Nowhere');
    await fireEvent.changeText(field, '  10001 ');
    await fireEvent.press(screen.getByLabelText('Search again'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'search', version: 3, answer: '10001' })));
  });

  it('Search again waits for an area', async () => {
    mockLoad.mockResolvedValue(envelope(run({ status: 'NO_RESULTS', question: null, slots: { location: 'Qzxqv Nowhere', budget: '', constraints: '' } })));
    await renderCard();
    await fireEvent.changeText(await screen.findByLabelText('City or ZIP code'), '   ');
    expect(screen.getByTestId('agent-search-again').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByLabelText('Search again'));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('retries a blocked run, and cancels', async () => {
    mockLoad.mockResolvedValue(envelope(run({ status: 'BLOCKED', question: null })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'CANCELLED', question: null })));
    await renderCard();
    expect(await screen.findByLabelText('Retry')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel search'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'cancel' })));
    expect(await screen.findByText('Research cancelled')).toBeTruthy();
    expect(screen.queryByLabelText('Cancel search')).toBeNull();
  });
});

describe('before a run exists', () => {
  it('offers “Find local businesses” to an eligible task and prepares a run', async () => {
    mockLoad.mockResolvedValue(envelope(null, { eligible: true, category: 'SERVICE', reason: null }));
    mockUpdate.mockResolvedValue(envelope(run()));
    const { onResearchAvailable } = await renderCard();

    expect(await screen.findByText('Find local businesses')).toBeTruthy();
    expect(
      screen.getByText('Google Places can find providers with phone numbers, addresses, ratings and quote-request drafts. Confirm your city to begin.'),
    ).toBeTruthy();
    expect(onResearchAvailable).toHaveBeenLastCalledWith(true);

    await fireEvent.press(screen.getByLabelText('Find businesses'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'prepare', version: 0 })));
    expect(await screen.findByText('One detail before I start')).toBeTruthy();
  });

  it('shows the intent’s reason for a research task and reports no business research', async () => {
    mockLoad.mockResolvedValue(envelope(null, { eligible: false, category: 'RESEARCH', reason: 'Compare a few options first.' }));
    const { onResearchAvailable } = await renderCard();
    expect(await screen.findByText('Compare a few options first.')).toBeTruthy();
    expect(onResearchAvailable).toHaveBeenLastCalledWith(false);
  });

  it('ignores the reason for other categories', async () => {
    mockLoad.mockResolvedValue(envelope(null, { eligible: false, category: 'ERRAND', reason: 'Not shown.' }));
    const { onResearchAvailable } = await renderCard();
    await waitFor(() => expect(onResearchAvailable).toHaveBeenCalledWith(false));
    expect(screen.queryByText('Not shown.')).toBeNull();
  });

  it('reports a load failure with a retry', async () => {
    mockLoad.mockRejectedValueOnce(new Error('The network is offline.'));
    await renderCard();
    expect(await screen.findByText('Could not refresh task research. The network is offline.')).toBeTruthy();

    mockLoad.mockResolvedValue(envelope(null, { eligible: true }));
    await fireEvent.press(screen.getByLabelText('Retry business search'));
    expect(await screen.findByText('Find local businesses')).toBeTruthy();
    expect(screen.queryByText(/Could not refresh task research/)).toBeNull();
  });
});

describe('the location step (TaskAgentCard.swift:67-87)', () => {
  it('searches the typed city, disabled while blank', async () => {
    mockLoad.mockResolvedValue(envelope(run()));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'QUEUED', question: null, slots: { location: '94109', budget: '', constraints: '' } })));
    await renderCard();

    expect(await screen.findByText('Which city or ZIP code should I search?')).toBeTruthy();
    expect(screen.getByText(/Search uses your city and service with Google Places/)).toBeTruthy();
    const search = screen.getByTestId('agent-search');
    expect(screen.getByLabelText('Search Plumbers')).toBeTruthy();
    expect(search.props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(screen.getByLabelText('City or ZIP code'), '94109');
    expect(screen.getByTestId('agent-search').props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(screen.getByTestId('agent-search'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('t1', { action: 'search', version: 3, key: 'location', answer: '94109', candidateId: undefined }),
    );
    expect(await screen.findByText('Finding the best business near your place…')).toBeTruthy();
  });

  it('sends the key the question asks for, not always "location"', async () => {
    mockLoad.mockResolvedValue(envelope(run({ question: { key: 'area', text: 'Which neighbourhood should I search?' } })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'QUEUED', question: null })));
    await renderCard();
    expect(await screen.findByText('Which neighbourhood should I search?')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('City or ZIP code'), 'Mission');
    await fireEvent.press(screen.getByTestId('agent-search'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'search', key: 'area', answer: 'Mission' })));
  });

  it('labels the search for other services and offers the known location', async () => {
    mockLoad.mockResolvedValue(envelope(run({ service: 'electrician', slots: { location: 'San Francisco', budget: '', constraints: '' } })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'CANCELLED', question: null })));
    await renderCard();
    expect(await screen.findByLabelText('Search businesses')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Use San Francisco'));
    expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'search', key: 'location', answer: 'San Francisco' }));
  });

  it('asks the discovery question with two answers', async () => {
    mockLoad.mockResolvedValue(envelope(run({ question: { key: 'discovery', text: 'Want me to find a pro?' } })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'CANCELLED', question: null })));
    await renderCard();
    expect(await screen.findByText('Want me to find a pro?')).toBeTruthy();
    expect(screen.queryByLabelText('City or ZIP code')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Find a professional'));
    expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'answer', key: 'discovery', answer: 'yes' }));
  });

  it('searches straight away for a run left at a retired question (TaskAgentCard.swift:154-159)', async () => {
    mockLoad.mockResolvedValue(envelope(run({ question: { key: 'urgency', text: 'How soon?' }, slots: { location: '94582', budget: '', constraints: '' } })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'QUEUED', question: null, slots: { location: '94582', budget: '', constraints: '' } })));
    await renderCard();
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', { action: 'search', version: 3, answer: '94582' }));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('How soon?')).toBeNull();
  });

  // No null leaves the card, so none can reach a zod `.optional()` on the route
  // (src/app/api/tasks/[id]/agent/route.ts:7). api/taskAgent.test.ts checks the body it builds.
  it('passes no null to the update for a search it sends on its own', async () => {
    mockLoad.mockResolvedValue(envelope(run({ question: { key: 'preferences', text: 'Anything else?' }, slots: { location: '94582', budget: '', constraints: '' } })));
    mockUpdate.mockResolvedValue(envelope(run({ status: 'QUEUED', question: null })));
    await renderCard();
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    for (const [, input] of mockUpdate.mock.calls) {
      expect(Object.values(input as Record<string, unknown>)).not.toContain(null);
    }
  });
});

describe('a 400 from the route (TaskAgentCard.swift:489-501)', () => {
  it('shows the server’s message instead of the spinner when a search is refused', async () => {
    mockLoad.mockResolvedValue(envelope(run({ slots: { location: '94582', budget: '', constraints: '' } })));
    mockUpdate.mockRejectedValue(new ApiError({ status: 400, message: 'Please enter a valid answer.' }));
    await renderCard();
    await fireEvent.press(await screen.findByLabelText('Use 94582'));
    expect(await screen.findByTestId('agent-message')).toHaveTextContent('Please enter a valid answer.');
    expect(screen.queryByText('Finding the best business near your place…')).toBeNull();
  });

  it('keeps the message through the reload that follows, rather than returning to a bare spinner', async () => {
    // A run left at a retired question searches on its own (`:154-159`); nothing is tapped here, so a
    // 400 that is cleared by the next load would leave the step spinning with nothing said.
    // A fresh object per call, as each poll's JSON is: react-query only advances `dataUpdatedAt` then.
    const retired = () => run({ question: { key: 'urgency', text: 'How soon?' }, slots: { location: '94582', budget: '', constraints: '' } });
    mockLoad.mockImplementation(async () => envelope(retired()));
    mockUpdate.mockRejectedValue(new ApiError({ status: 400, message: 'Please enter a valid answer.' }));
    const { queryClient } = await renderCard();
    // The auto-search path prefixes the server's own sentence, which stays visible either way.
    const message = 'Could not refresh task research. Please enter a valid answer.';
    expect(await screen.findByTestId('agent-message')).toHaveTextContent(message);

    const loadsBefore = mockLoad.mock.calls.length;
    await act(async () => {
      await queryClient.refetchQueries();
    });
    expect(mockLoad.mock.calls.length).toBeGreaterThan(loadsBefore);
    expect(screen.getByTestId('agent-message')).toHaveTextContent(message);
    expect(screen.queryByText('Finding the best business near your place…')).toBeNull();
    expect(screen.getByTestId('agent-retry-search')).toBeTruthy();
  });

  it('clears the message once a later action succeeds', async () => {
    mockLoad.mockResolvedValue(envelope(run({ slots: { location: '94582', budget: '', constraints: '' } })));
    mockUpdate.mockRejectedValueOnce(new ApiError({ status: 400, message: 'Please enter a valid answer.' }));
    await renderCard();
    await fireEvent.press(await screen.findByLabelText('Use 94582'));
    expect(await screen.findByTestId('agent-message')).toHaveTextContent('Please enter a valid answer.');

    mockUpdate.mockResolvedValue(envelope(run({ status: 'QUEUED', question: null })));
    await fireEvent.press(screen.getByLabelText('Use 94582'));
    await waitFor(() => expect(screen.queryByTestId('agent-message')).toBeNull());
  });
});

describe('notices and warnings (TaskAgentCard.swift:94, :404-429)', () => {
  const warnings = [
    'Yelp is not connected. Connect it for more results.',
    'Listings are not a license check or a guarantee of availability.',
    'Some businesses were hidden because reviews could not be verified.',
    'Results may be limited in your area.',
  ];

  it('keeps only the other warnings inline', () => {
    expect(inlineWarnings(warnings)).toEqual(['Results may be limited in your area.']);
  });

  it('opens the policy on the API host and toggles the search notices', async () => {
    mockLoad.mockResolvedValue(envelope(ready({ warnings })));
    await renderCard();
    expect(await screen.findByText('Results may be limited in your area.')).toBeTruthy();
    expect(screen.queryByText(/Yelp is not connected/)).toBeNull();
    expect(screen.queryByText(/Listings are not a license check/)).toBeNull();

    await fireEvent.press(screen.getByLabelText('Show search notices'));
    expect(screen.getByText(/Listings are not a license check/)).toBeTruthy();
    expect(screen.getByLabelText('Hide search notices').props.accessibilityValue).toEqual({ text: 'Expanded' });

    await fireEvent.press(screen.getByLabelText('Search terms and privacy'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://api.example.test/places-policy');
  });
});

describe('the shortlist', () => {
  it('formats ratings as Swift does', () => {
    expect(reviewCountText({ source: 'Google', url: '', rating: 4.9, reviews: 1403 })).toBe('(1,403 reviews)');
    expect(reviewCountText({ source: 'Google', url: '', rating: null, reviews: null })).toBe('Reviews unavailable');
    expect(stars(4.5)).toEqual(['full', 'full', 'full', 'full', 'half']);
    expect(stars(4)).toEqual(['full', 'full', 'full', 'full', 'empty']);
    expect(capitalizedWords('hvac TECHNICIAN')).toBe('Hvac Technician');
  });

  it('renders the results header and rows, the first expanded and most reviewed', async () => {
    mockLoad.mockResolvedValue(
      envelope(
        ready({
          candidates: [
            candidate('0'),
            candidate('1', { evidence: [{ source: 'Yelp', url: '', rating: null, reviews: null }] }),
          ],
        }),
      ),
    );
    await renderCard();
    expect(await screen.findByText('Plumber · 94582')).toBeTruthy();
    expect(screen.getByText(/I found the best plumbers/)).toBeTruthy();
    expect(screen.getByText('Business 0')).toBeTruthy();
    expect(screen.getByText('4.9')).toBeTruthy();
    expect(screen.getAllByText('(1,403 reviews)')).toHaveLength(1);
    expect(screen.getByText('Not rated')).toBeTruthy();
    expect(screen.getByText('Reviews unavailable')).toBeTruthy();
    expect(screen.getByText('Most reviewed')).toBeTruthy();
    // Single expansion: opening the second closes the first.
    expect(screen.getAllByText('Open in Messages')).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('agent-business-1'));
    expect(screen.queryByText('Most reviewed')).toBeNull();
    expect(screen.getAllByText('Open in Messages')).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('agent-business-1'));
    expect(screen.queryByText('Open in Messages')).toBeNull();
  });

  it('shows the reviews and services tabs', async () => {
    mockLoad.mockResolvedValue(envelope(ready()));
    await renderCard();
    await fireEvent.press(await screen.findByTestId('agent-tab-0-1'));
    expect(screen.getByText('Google Maps')).toBeTruthy();
    expect(screen.getByText('5/5 · a month ago')).toBeTruthy();
    // A review that fits in 3 lines has no "Show more" (Android ahead of iOS).
    const measure = screen.getByTestId('agent-review-measure-0https://maps.google.com/review-0', { includeHiddenElements: true });
    await act(async () => measure.props.onTextLayout({ nativeEvent: { lines: [{}, {}] } }));
    expect(screen.queryByLabelText('Show more of Sample reviewer’s review')).toBeNull();
    // One cut off at 3 lines has it.
    await act(async () => measure.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}, {}, {}] } }));
    await fireEvent.press(screen.getByLabelText('Show more of Sample reviewer’s review'));
    expect(screen.getByLabelText('Show less of Sample reviewer’s review')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Read review on Google Maps'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://maps.google.com/review-0');

    await fireEvent.press(screen.getByTestId('agent-tab-0-2'));
    expect(screen.getByText('Ask the business to confirm the services, pricing, and availability for your request.')).toBeTruthy();
    expect(screen.getByLabelText('Explore services on website ↗')).toBeTruthy();
  });

  it('copies the phone number', async () => {
    mockLoad.mockResolvedValue(envelope(ready()));
    await renderCard();
    await fireEvent.press(await screen.findByTestId('agent-copy-phone-0'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('(925) 567-9000');
    expect(screen.getByText('Phone number copied.')).toBeTruthy();
  });

  it('says "Phone number copied." as a confirmation, not an error: the search spinner stays', async () => {
    mockLoad.mockResolvedValue(envelope(ready({ status: 'RUNNING' })));
    await renderCard();
    await fireEvent.press(await screen.findByTestId('agent-copy-phone-0'));
    expect(screen.getByTestId('agent-notice').props.children).toBe('Phone number copied.');
    expect(screen.queryByTestId('agent-message')).toBeNull();
    expect(screen.getByText('Finding the best business near your place…')).toBeTruthy();
  });

  it('says "Draft copied." as a confirmation, and the next action clears it', async () => {
    mockLoad.mockResolvedValue(envelope(ready()));
    mockUpdate.mockResolvedValue(envelope(ready()));
    await renderCard();
    await fireEvent.press(await screen.findByTestId('agent-draft-toggle-0'));
    await fireEvent.press(screen.getByLabelText('Copy draft'));
    expect(screen.getByTestId('agent-notice').props.children).toBe('Draft copied.');
    expect(screen.queryByTestId('agent-message')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Save draft'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(screen.queryByTestId('agent-notice')).toBeNull();
  });

  it('chooses a business for the stored action', async () => {
    useCoordinator.getState().reset({ actions: [storedAction()] });
    mockLoad.mockResolvedValue(envelope(ready()));
    await renderCard();
    await fireEvent.press(await screen.findByLabelText('Choose this business'));
    expect(useCoordinator.getState().actions[0]).toMatchObject({ businessCandidateID: '0', contactIdentifier: null, manualRecipient: null });
    expect(screen.getByLabelText('Selected for this task')).toBeTruthy();
  });

  it('preselects the stored action’s business', async () => {
    useCoordinator.getState().reset({ actions: [storedAction({ businessCandidateID: '1' })] });
    mockLoad.mockResolvedValue(envelope(ready()));
    await renderCard();
    expect(await screen.findByLabelText('Selected for this task')).toBeTruthy();
    expect(screen.getByTestId('business.select.1')).toBeTruthy();
    expect(screen.queryByText('Most reviewed')).toBeNull();
  });

  it('has no choose button without a stored action', async () => {
    mockLoad.mockResolvedValue(envelope(ready()));
    await renderCard();
    expect(await screen.findByText('Open in Messages')).toBeTruthy();
    expect(screen.queryByLabelText('Choose this business')).toBeNull();
  });
});

describe('the outreach draft (TaskAgentCard.swift:324-368)', () => {
  it('edits, saves and copies the draft', async () => {
    mockLoad.mockResolvedValue(envelope(ready()));
    mockUpdate.mockResolvedValue(envelope(ready()));
    await renderCard();
    expect(await screen.findByText('Review or edit outreach draft')).toBeTruthy();
    expect(screen.getByText('Your message is ready to personalize.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('agent-draft-toggle-0'));

    const input = screen.getByLabelText('Draft for Business 0');
    expect(input.props.value).toBe('Hello 0, could you provide a quote?');
    expect(input.props.maxLength).toBe(2000);
    await fireEvent.changeText(input, 'Hi, are you free Friday?');

    await fireEvent.press(screen.getByLabelText('Copy draft'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Hi, are you free Friday?');
    expect(screen.getByText('Draft copied.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Save draft'));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('t1', { action: 'saveDraft', version: 3, key: undefined, answer: 'Hi, are you free Friday?', candidateId: '0' }),
    );
  });

  it('opens Messages with the number and draft, and says it was submitted', async () => {
    mockLoad.mockResolvedValue(envelope(ready()));
    await renderCard();
    await fireEvent.press(await screen.findByTestId('agent-messages-0'));
    await waitFor(() => expect(SMS.sendSMSAsync).toHaveBeenCalledWith(['(925) 567-9000'], 'Hello 0, could you provide a quote?'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Messages', 'Message submitted to Messages. Delivery is not confirmed.', [{ text: 'OK', style: 'cancel' }]),
    );
    expect(screen.getByText('Review the number and message, then tap Send. Some business numbers cannot receive texts.')).toBeTruthy();
  });

  it('explains when Messages is unavailable', async () => {
    jest.mocked(SMS.isAvailableAsync).mockResolvedValue(false);
    mockLoad.mockResolvedValue(envelope(ready()));
    await renderCard();
    await fireEvent.press(await screen.findByTestId('agent-messages-0'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Messages',
        'Messages is not available on this device. You can copy the draft and phone number instead.',
        expect.any(Array),
      ),
    );
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  });

  it('says nothing when the composer is cancelled', async () => {
    jest.mocked(SMS.sendSMSAsync).mockResolvedValue({ result: 'cancelled' });
    mockLoad.mockResolvedValue(envelope(ready()));
    await renderCard();
    await fireEvent.press(await screen.findByTestId('agent-messages-0'));
    await waitFor(() => expect(SMS.sendSMSAsync).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('cannot open Messages without a phone number', async () => {
    mockLoad.mockResolvedValue(envelope(ready({ candidates: [candidate('0', { phone: '' })] })));
    await renderCard();
    expect(await screen.findByText('Phone unavailable')).toBeTruthy();
    expect(screen.getByTestId('agent-messages-0').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
