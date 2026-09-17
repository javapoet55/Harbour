import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ScheduleIntelligenceResponse } from '../api';
import { queryKeys } from '../query/keys';
import { useSession } from '../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

const mockIntelligence = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { scheduleIntelligence: (...args: unknown[]) => mockIntelligence(...args) },
}));

import CalendarConflicts from '../../app/calendar/conflicts';

const ZONE = 'Asia/Kolkata';
const PROFILE = { id: 'u1', name: 'Ada', email: 'a@b.c', timeZone: ZONE };

/** Today in the account zone, which is what `dates.key(Date())` compares against. */
function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
}

function intelligence(day: string, attention: ScheduleIntelligenceResponse['today']['attention']): ScheduleIntelligenceResponse {
  return {
    today: {
      day,
      timeZone: ZONE,
      appointments: 2,
      availableMinutes: 120,
      recommendation: { title: 'Protect the morning', explanation: 'Two commitments this afternoon.' },
      attention,
    },
  } as ScheduleIntelligenceResponse;
}

const ITEM = {
  id: 'overloaded',
  label: 'Overloaded day',
  title: 'Three tasks overlap at 2 PM',
  explanation: 'You have 45 minutes of usable time and 120 minutes of work.',
  recommendedAction: 'Move one task to tomorrow morning.',
  kind: 'OVERLOADED_DAY',
};

function show() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(queryKeys.me(), PROFILE);
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarConflicts />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', profile: PROFILE });
});

/** `conflictSheet` (ios/App/CalendarView.swift:463-477). */
describe('the schedule review sheet', () => {
  it('lists today’s attention items under Swift’s section title', async () => {
    mockIntelligence.mockResolvedValue(intelligence(todayKey(), [ITEM]));

    await show();

    await waitFor(() => expect(screen.getByTestId('conflict-overloaded')).toBeTruthy());
    expect(screen.getByText('Schedule review')).toBeTruthy();
    expect(screen.getByText('TODAY’S SCHEDULE REVIEW')).toBeTruthy();
    expect(screen.getByText('Overloaded day')).toBeTruthy();
    expect(screen.getByText('Three tasks overlap at 2 PM')).toBeTruthy();
    expect(screen.getByText('You have 45 minutes of usable time and 120 minutes of work.')).toBeTruthy();
    expect(screen.getByText('Move one task to tomorrow morning.')).toBeTruthy();
  });

  it('says so when intelligence reports nothing', async () => {
    mockIntelligence.mockResolvedValue(intelligence(todayKey(), []));

    await show();

    await waitFor(() => expect(screen.getByTestId('conflicts-empty')).toBeTruthy());
    expect(screen.getByText('No issues reported by schedule intelligence.')).toBeTruthy();
  });

  /**
   * `intelligenceStatus()`'s third branch — "Review schedule" when the stored review is not today's
   * (CalendarView.swift:305-311) — is UNREACHABLE through this data layer, and deliberately so:
   * `useScheduleIntelligence` (src/query/useToday.ts:143) already rejects a response whose `day` is
   * not today, so a stale review arrives as an error with its own retry rather than as stale data.
   * The branch stays in the component for the case where nothing has been fetched at all.
   */
  it('treats a review from another day as a failure, not as stale data', async () => {
    mockIntelligence.mockResolvedValue(intelligence('2020-01-01', [ITEM]));

    await show();

    await waitFor(() => expect(screen.getByTestId('conflicts-error')).toBeTruthy());
    expect(screen.queryByTestId('conflict-overloaded')).toBeNull();
    expect(screen.getByText('Retry schedule intelligence')).toBeTruthy();
  });

  it('shows the failure, the stale notice and a retry', async () => {
    mockIntelligence.mockRejectedValue(new Error('Schedule intelligence is unavailable.'));

    await show();

    await waitFor(() => expect(screen.getByTestId('conflicts-error')).toBeTruthy());
    expect(screen.getByText('Schedule intelligence is unavailable.')).toBeTruthy();
    expect(screen.getByText('Retry schedule intelligence')).toBeTruthy();
    // Nothing succeeded yet, so there is no "last successful review" to mention.
    expect(screen.queryByText('Showing the last successful review.')).toBeNull();
  });

  it('retrying asks the server again', async () => {
    mockIntelligence.mockRejectedValue(new Error('Schedule intelligence is unavailable.'));
    await show();
    await waitFor(() => expect(screen.getByTestId('conflicts-retry')).toBeTruthy());
    mockIntelligence.mockClear();

    fireEvent.press(screen.getByTestId('conflicts-retry'));

    await waitFor(() => expect(mockIntelligence).toHaveBeenCalled());
  });

  it('shows no status block at all once today’s review is current', async () => {
    mockIntelligence.mockResolvedValue(intelligence(todayKey(), [ITEM]));

    await show();

    await waitFor(() => expect(screen.getByTestId('conflict-overloaded')).toBeTruthy());
    expect(screen.queryByTestId('conflicts-review')).toBeNull();
    expect(screen.queryByTestId('conflicts-error')).toBeNull();
    expect(screen.queryByTestId('conflicts-loading')).toBeNull();
  });

  it('Done dismisses', async () => {
    mockIntelligence.mockResolvedValue(intelligence(todayKey(), [ITEM]));
    await show();
    await waitFor(() => expect(screen.getByTestId('conflicts-done')).toBeTruthy());

    fireEvent.press(screen.getByTestId('conflicts-done'));

    expect(mockBack).toHaveBeenCalled();
  });
});
