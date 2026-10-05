import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';

import type { Profile } from '../../../api';
import { useSession } from '../../../store/session';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock('../../../api/nutrition', () => ({
  nutritionApi: {
    settings: jest.fn(async () => ({ enabled: false, phoneVerified: false, localTime: '20:00', timeZone: 'UTC', repeatDaily: true, noAnswer: 'NOTIFY', voice: 'marin', calorieGoal: 2000, voices: ['marin'] })),
    day: jest.fn(async () => ({ date: '2026-10-05', calorieGoal: 2000, totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, needsReview: 0, entries: [] })),
  },
}));
jest.mock('../../shopping/store', () => ({ shoppingStore: { getState: () => ({ refresh: jest.fn() }) } }));

import CalorieTrackerScreen from '../../../../app/wellness/calories';
import { editorValid } from '../FoodEditor';

/** The chooser's Calorie Tracker card → its guide → "Got it!" opens this route (navigation.test.ts). */

async function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <CalorieTrackerScreen />
    </QueryClientProvider>,
  );
  return { client, view };
}

beforeEach(() => {
  mockParams = {};
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
});

test('signed in, it is the live tracker (Swift passes the API client)', async () => {
  const { client } = await open();
  await waitFor(() => expect(screen.getByTestId('calorie-status')).toHaveTextContent('Daily calls are off'));
  client.clear();
});

test('a development build opens the design preview with ?preview=1, as Swift’s -calorie-design-preview', async () => {
  mockParams = { preview: '1' };
  const { client } = await open();
  expect(screen.getByTestId('calorie-status')).toHaveTextContent('UI Preview · Sample data · No calls are scheduled');
  client.clear();
});

test('the editor accepts a name and 0 to 5,000 whole calories (`editorValid`)', () => {
  expect(editorValid({ name: 'Tea', calories: '0' })).toBe(true);
  expect(editorValid({ name: 'Tea', calories: '5000' })).toBe(true);
  expect(editorValid({ name: 'Tea', calories: '5001' })).toBe(false);
  expect(editorValid({ name: 'Tea', calories: '' })).toBe(false);
  expect(editorValid({ name: 'Tea', calories: '1.5' })).toBe(false);
  expect(editorValid({ name: '   ', calories: '10' })).toBe(false);
});
