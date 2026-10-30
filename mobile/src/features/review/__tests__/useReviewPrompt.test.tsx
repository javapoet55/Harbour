import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import * as StoreReview from 'expo-store-review';
import { AppState, Keyboard } from 'react-native';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

import { REVIEW_SCHEDULE_KEY } from '../reviewPrompt';
import { REVIEW_CHECK_MS, useReviewPrompt } from '../useReviewPrompt';

/**
 * `AppReviewPromptModifier` (ios/App/AppReviewPrompt.swift:27-58): every 30 s on the signed-in tabs, with
 * nothing over them and no keyboard, consume this week's opportunity and ask the store.
 */

// Friday 30 Oct 2026, 18:00 in the device zone the tests run in, three weeks after first launch.
const FRIDAY_EVENING = new Date(2026, 9, 30, 18, 0, 0).getTime();
const INSTALLED = FRIDAY_EVENING - 21 * 86_400_000;

function Probe() {
  useReviewPrompt();
  return null;
}

const requestReview = StoreReview.requestReview as jest.Mock;
const isAvailable = StoreReview.isAvailableAsync as jest.Mock;

beforeEach(async () => {
  jest.useFakeTimers({ now: FRIDAY_EVENING, doNotFake: ['nextTick', 'setImmediate'] });
  jest.clearAllMocks();
  mockFocused = true;
  isAvailable.mockResolvedValue(true);
  await AsyncStorage.clear();
  await AsyncStorage.setItem(REVIEW_SCHEDULE_KEY, JSON.stringify({ firstLaunch: INSTALLED }));
  // The Jest preset's `AppState.currentState` is a mock function; the app reads the string (as shake.test.tsx).
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function tick(ms = REVIEW_CHECK_MS) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

it('asks after the first 30 seconds, not before, and stores the week first', async () => {
  await render(<Probe />);
  await tick(REVIEW_CHECK_MS - 1);
  expect(requestReview).not.toHaveBeenCalled();
  await tick(1);
  expect(requestReview).toHaveBeenCalledTimes(1);
  expect(JSON.parse((await AsyncStorage.getItem(REVIEW_SCHEDULE_KEY))!).lastRequestedWeek).toBeGreaterThanOrEqual(0);
});

it('asks once that week however long the tabs stay open', async () => {
  await render(<Probe />);
  await tick();
  await tick();
  await tick();
  expect(requestReview).toHaveBeenCalledTimes(1);
});

it('waits while something is over the tabs', async () => {
  mockFocused = false;
  await render(<Probe />);
  await tick();
  expect(requestReview).not.toHaveBeenCalled();
});

it('waits while the keyboard is up', async () => {
  (Keyboard.isVisible as jest.Mock).mockReturnValue(true);
  await render(<Probe />);
  await tick();
  expect(requestReview).not.toHaveBeenCalled();
  (Keyboard.isVisible as jest.Mock).mockReturnValue(false);
  await tick();
  expect(requestReview).toHaveBeenCalledTimes(1);
});

it('waits while the app is in the background', async () => {
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true, writable: true });
  await render(<Probe />);
  await tick();
  expect(requestReview).not.toHaveBeenCalled();
});

it('asks nothing outside the Friday evening window', async () => {
  jest.setSystemTime(FRIDAY_EVENING - 2 * 3_600_000); // 16:00
  await render(<Probe />);
  await tick();
  expect(requestReview).not.toHaveBeenCalled();
  expect(JSON.parse((await AsyncStorage.getItem(REVIEW_SCHEDULE_KEY))!).lastRequestedWeek).toBeUndefined();
});
