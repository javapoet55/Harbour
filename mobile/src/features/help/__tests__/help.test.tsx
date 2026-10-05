import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockSubmit = jest.fn();
jest.mock('../../../api/feedback', () => ({ feedbackApi: { submit: (...args: unknown[]) => mockSubmit(...args) } }));

import { FeedbackScreen } from '../FeedbackScreen';
import { HelpScreen } from '../HelpScreen';

/** `HelpView` (ios/App/HelpView.swift) and `FeedbackView` (ios/App/FeedbackView.swift). */

describe('Help', () => {
  async function open() {
    const onBack = jest.fn();
    const onFeedback = jest.fn();
    await render(<HelpScreen onBack={onBack} onFeedback={onFeedback} />);
    return { onBack, onFeedback };
  }

  it('shows the intro, both categories and every topic grouped by category', async () => {
    await open();
    expect(screen.getByRole('header')).toHaveTextContent('Help');
    expect(screen.getByText('NEXDO HELP')).toBeTruthy();
    expect(screen.getByText('How can we help you?')).toBeTruthy();
    expect(screen.getByText('Appointments, dates & scheduling')).toBeTruthy();
    expect(screen.getByText('To-dos, priorities & progress')).toBeTruthy();
    expect(screen.getAllByText('10 questions')).toHaveLength(2);
    expect(screen.getByText('Browse help topics')).toBeTruthy();
    expect(screen.getAllByTestId(/^help-topic-/)).toHaveLength(20);
    expect(screen.queryByTestId('help-count')).toBeNull();
  });

  it('expands a topic to its answer, and typing collapses it again', async () => {
    await open();
    const topic = within(screen.getByTestId('help-topic-calendar-complete'));
    await fireEvent.press(topic.getByRole('button'));
    expect(topic.getByText(/Tap the appointment to open Event Details/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('help-search'), 'complete');
    expect(screen.queryByText(/Tap the appointment to open Event Details/)).toBeNull();
  });

  it('searches answers and keywords, counts the answers, and clears', async () => {
    await open();
    await fireEvent.changeText(screen.getByTestId('help-search'), 'subtasks');
    expect(screen.getByTestId('help-count')).toHaveTextContent('1 answer found');
    expect(screen.getAllByTestId(/^help-topic-/).map((node) => node.props.testID)).toEqual(['help-topic-tasks-notes']);
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getAllByTestId(/^help-topic-/)).toHaveLength(20);
  });

  it('filters by category, toggles it off, and View all returns to everything', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('help-category-Tasks'));
    expect(screen.getByTestId('help-category-Tasks').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('Tasks questions')).toBeTruthy();
    expect(screen.getAllByTestId(/^help-topic-tasks-/)).toHaveLength(10);
    expect(screen.queryByTestId('help-topic-calendar-create')).toBeNull();
    await fireEvent.press(screen.getByTestId('help-view-all'));
    expect(screen.getAllByTestId(/^help-topic-/)).toHaveLength(20);
    await fireEvent.press(screen.getByTestId('help-category-Calendar'));
    await fireEvent.press(screen.getByTestId('help-category-Calendar'));
    expect(screen.getByText('Browse help topics')).toBeTruthy();
  });

  it('says when nothing matches, and Reset search clears the query and the category', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('help-category-Tasks'));
    await fireEvent.changeText(screen.getByTestId('help-search'), 'Google');
    expect(screen.getByText('No matching topics')).toBeTruthy();
    expect(screen.getByText('Try “repeat”, “complete”, or “add an appointment”, or search all categories.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('help-reset'));
    expect(screen.getByTestId('help-search').props.value).toBe('');
    expect(screen.getAllByTestId(/^help-topic-/)).toHaveLength(20);
  });

  it('"Still need help?" opens Feedback; Back goes back', async () => {
    const { onBack, onFeedback } = await open();
    expect(screen.getByText('Share a question or suggestion in Feedback.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('help-feedback'));
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onFeedback).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });
});

describe('Feedback', () => {
  let client: QueryClient;
  async function open() {
    client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
    const onDone = jest.fn();
    await render(
      <QueryClientProvider client={client}>
        <FeedbackScreen onDone={onDone} />
      </QueryClientProvider>,
    );
    return onDone;
  }
  afterEach(() => client.clear());
  beforeEach(() => mockSubmit.mockReset());

  it('needs a title, a description and a rating; counts in UTF-16 units', async () => {
    await open();
    expect(screen.getByRole('header')).toHaveTextContent('Feedback');
    expect(screen.getByText('Choose 1 to 5 stars.')).toBeTruthy();
    expect(screen.getByLabelText('Submit feedback').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('feedback.title'), '😀 Idea');
    expect(screen.getByTestId('feedback.title.count')).toHaveTextContent('7/160');
    await fireEvent.changeText(screen.getByTestId('feedback.description'), 'More themes');
    expect(screen.getByTestId('feedback.description.count')).toHaveTextContent('11/5000');
    await fireEvent.press(screen.getByLabelText('4 stars'));
    expect(screen.getByText('4 out of 5 stars')).toBeTruthy();
    expect(screen.getByLabelText('4 stars').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('1 star')).toBeTruthy();
    expect(screen.getByLabelText('Submit feedback').props.accessibilityState.disabled).toBe(false);
    await fireEvent.changeText(screen.getByTestId('feedback.title'), 'a'.repeat(161));
    expect(screen.getByTestId('feedback.title.count')).toHaveTextContent('161/160');
    expect(screen.getByLabelText('Submit feedback').props.accessibilityState.disabled).toBe(true);
  });

  it('submits trimmed text under one id, shows the failure, retries with the same id, then thanks', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onDone = await open();
    mockSubmit.mockRejectedValueOnce(new Error('Enter a title, description, and a rating from 1 to 5 stars.')).mockResolvedValueOnce({ ok: true });
    await fireEvent.changeText(screen.getByTestId('feedback.title'), ' Idea ');
    await fireEvent.changeText(screen.getByTestId('feedback.description'), ' More themes ');
    await fireEvent.press(screen.getByLabelText('5 stars'));
    await fireEvent.press(screen.getByLabelText('Submit feedback'));
    await waitFor(() => expect(screen.getByTestId('feedback-failure')).toHaveTextContent('Enter a title, description, and a rating from 1 to 5 stars.'));
    await fireEvent.press(screen.getByLabelText('Submit feedback'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    const [first, second] = mockSubmit.mock.calls.map((call) => call[0]);
    expect(first).toEqual({ id: expect.any(String), title: 'Idea', description: 'More themes', stars: 5 });
    expect(second.id).toBe(first.id);
    expect(alert.mock.calls[0][0]).toBe('Thank you for your feedback!');
    expect(alert.mock.calls[0][1]).toBe('Your feedback has been received. Thank you for helping us make Nexdo better.');
    // Submitted: the form stays locked; Done goes back.
    expect(screen.getByLabelText('Submit feedback').props.accessibilityState.disabled).toBe(true);
    const done = (alert.mock.calls[0][2] as { text: string; onPress: () => void }[])[0];
    expect(done.text).toBe('Done');
    await act(async () => done.onPress());
    expect(onDone).toHaveBeenCalled();
    alert.mockRestore();
  });
});
