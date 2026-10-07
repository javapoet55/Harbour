import { router, useLocalSearchParams } from 'expo-router';

import { PomodoroView } from '../../src/features/pomodoro/PomodoroView';
import { pomodoroStore } from '../../src/features/pomodoro/device';
import { FixedLightStatusBar } from '../../src/features/wellness/FixedLightStatusBar';
import { closePresentedScreens } from '../../src/lib/sessionNavigation';
import { useSession } from '../../src/store/session';

/**
 * Pomodoro's cover. Two entrances, as Swift's:
 *
 * - from the chooser, after its guide: the completion button says "Done" and closes Pomodoro, back to the chooser
 *   (Android ahead of iOS, iOS f6d6452: Swift said "Back to Tasks" and opened Tasks);
 * - from a tapped alert (`from=notification`, RootView.swift:219-223): "Back to Tasks" is `selection = .tasks`,
 *   with the list's date left as it was.
 *
 * Closing the dashboard is `dismiss()`: back to the chooser, or to the tabs.
 */
export default function PomodoroScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const owner = useSession((state) => state.profile?.id ?? null);
  const toTasks = async () => {
    await closePresentedScreens();
    router.navigate('/tasks');
  };
  return (
    <>
      {/* Fixed light in both modes (`.preferredColorScheme(.light)`), so the clock stays dark. */}
      <FixedLightStatusBar />
      <PomodoroView onClose={() => router.back()} onTasks={from === 'notification' ? () => void toTasks() : undefined} owner={owner} store={pomodoroStore} />
    </>
  );
}
