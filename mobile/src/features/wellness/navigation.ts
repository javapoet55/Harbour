import { router } from 'expo-router';

import { closePresentedScreens } from '../../lib/sessionNavigation';
import { useTaskQuery } from '../../store/taskQuery';
import type { WellnessModule } from './art';

/**
 * Where the Wellness covers lead (ios/App/RootView.swift:212-216, WellnessChooserView.swift:44-62).
 *
 * The chooser, each module's guide and Pomodoro are full-screen covers over the tabs (app/wellness/).
 * Leaving closes every one of them first, while their stack exists, then does what Swift's
 * `onDismiss` does with the choice.
 */

/** `WellnessExit` (WellnessChooserView.swift:3). */
export type WellnessExit = 'home' | 'calendar' | 'tasks' | 'askAI';

export async function leaveWellness(exit: WellnessExit): Promise<void> {
  await closePresentedScreens();
  switch (exit) {
    case 'home':
      router.navigate('/today');
      return;
    case 'calendar':
      router.navigate('/calendar');
      return;
    case 'tasks':
      // `model.taskQuery.date = .today; selection = .tasks`
      useTaskQuery.getState().setQuery({ date: 'Today' });
      router.navigate('/tasks');
      return;
    case 'askAI':
      // `showingAsk = true` over whatever tab is showing.
      router.push('/ask');
      return;
  }
}

/** A module card: its guide first, every time (`WellnessModuleEntrance`, WellnessModuleGuide.swift:133-141). */
export function openModuleGuide(module: WellnessModule): void {
  router.push({ pathname: '/wellness/guide/[kind]', params: { kind: module } });
}

/**
 * "Got it!" — the module itself (`moduleDestination`, WellnessChooserView.swift:44-58).
 *
 * Pomodoro and the Calorie Tracker replace the guide inside the cover, as Swift's entrance swaps its
 * content. Moments and Shopping are the EXISTING screens, which live in the Today tab's stack: the covers
 * close and the screen is pushed there. DIVERGENCE: Swift shows them inside the cover, so their Back
 * returns to the chooser; here Back returns to Today (§22 Run C).
 */
export async function continueToModule(module: WellnessModule): Promise<void> {
  if (module === 'pomodoro') {
    router.replace('/wellness/pomodoro');
    return;
  }
  if (module === 'calories') {
    router.replace('/wellness/calories');
    return;
  }
  await closePresentedScreens();
  router.navigate(module === 'moments' ? '/wellness/moments' : '/wellness/shopping');
}
