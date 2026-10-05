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
 * `WellnessModuleEntrance` swaps the guide for the module inside the cover (`continued = true`,
 * WellnessModuleGuide.swift:133-141), so every module REPLACES the guide in the wellness stack: Back
 * from the module's first screen (Moments' `backButton`, `destination = nil`) returns to the chooser.
 * The chooser's bottom bar is its own `safeAreaInset` (:36), so it is hidden inside a module.
 */
export async function continueToModule(module: WellnessModule): Promise<void> {
  router.replace(MODULE_ROUTE[module]);
}

const MODULE_ROUTE = {
  pomodoro: '/wellness/pomodoro',
  calories: '/wellness/calories',
  moments: '/wellness/moments',
  shopping: '/wellness/shopping',
} as const satisfies Record<WellnessModule, string>;
