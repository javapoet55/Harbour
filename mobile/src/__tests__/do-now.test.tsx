import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';

import type { DoNowNext } from '../api/types';
import { useConsent } from '../store/consent';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}) }));

const mockDoNow = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    doNow: (...args: unknown[]) => mockDoNow(...args),
    tasks: jest.fn(async () => ({ tasks: [] })),
  },
}));

import DoNow from '../../app/(tabs)/(today)/today/do-now';

/** DoNowView.swift:50 (d568989): the window line names an excluded working day before the hours. */

function answer(next: Partial<DoNowNext>) {
  return {
    executive: {
      generatedAt: '2026-10-10T16:04:00Z',
      timeZone: 'America/Los_Angeles',
      summary: 'Saturday is not selected in your saved working days.',
      recommendedActions: [],
      nextAction: { bestAction: null, alternatives: [], availableWindowMinutes: 0, continuingFocus: false, ...next },
    },
  };
}

async function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <DoNow />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockDoNow.mockReset();
  useConsent.setState({ ai: true, voice: false });
});

it.each([
  [{ outsideWorkingDay: true, outsideWorkingHours: true }, 'Today isn’t a selected working day'],
  [{ outsideWorkingDay: false, outsideWorkingHours: true }, 'Outside your working hours'],
  [{ availableWindowMinutes: 45 }, 'You have 45 minutes free now'],
])('says %j as “%s”', async (next, line) => {
  mockDoNow.mockResolvedValue(answer(next));
  await show();
  await waitFor(() => expect(screen.getByTestId('do-now-window')).toHaveTextContent(line));
});
