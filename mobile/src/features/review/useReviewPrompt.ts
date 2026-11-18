import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard } from 'react-native';

import { consumeReviewOpportunity, requestStoreReview } from './reviewPrompt';

/** `Task.sleep(for: .seconds(30))`: "Let navigation and initial loading settle; also catches crossing 5 p.m." */
export const REVIEW_CHECK_MS = 30_000;

/**
 * `AppReviewPromptModifier` (ios/App/AppReviewPrompt.swift:27-58) on the signed-in tabs (RootView.swift:139-142):
 * while the app is active, every 30 seconds, ask the schedule for this week's request and, if it says yes,
 * show the store's own rating sheet. No pre-prompt and no sentiment filter.
 *
 * Swift waits for nothing presented over the tabs, no text field focused and no busy state, alert or task
 * action. Here that is: the tabs are the focused root screen (anything over them, Ask, a reminder action, a
 * sheet, takes the focus), the keyboard is down, and the app is active.
 */
export function useReviewPrompt(): void {
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const checking = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  // `.task(id: phase == .active && !busy)`: the loop starts again, from a full 30 seconds, each time.
  useEffect(() => {
    if (!active || !focused) return undefined;
    const timer = setInterval(() => {
      if (checking.current || AppState.currentState !== 'active' || Keyboard.isVisible()) return;
      checking.current = true;
      void consumeReviewOpportunity()
        .then((open) => (open ? requestStoreReview() : undefined))
        .finally(() => {
          checking.current = false;
        });
    }, REVIEW_CHECK_MS);
    return () => clearInterval(timer);
  }, [active, focused]);
}
