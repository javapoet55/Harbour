import { router, useLocalSearchParams } from 'expo-router';

import { PomodoroView } from '../../src/features/pomodoro/PomodoroView';
import { pomodoroStore } from '../../src/features/pomodoro/device';
import { FixedLightStatusBar } from '../../src/features/wellness/FixedLightStatusBar';
import { leaveWellness } from '../../src/features/wellness/navigation';
import { closePresentedScreens } from '../../src/lib/sessionNavigation';
import { useSession } from '../../src/store/session';

/**
 * Pomodoro's cover. Two entrances, as Swift's:
 *
 * - from the chooser, after its guide: "Back to Tasks" is `destination = nil; onSelect(.tasks)` — the
 *   covers close and Tasks opens on Today (WellnessChooserView.swift:49-50);
 * - from a tapped alert (`from=notification`, RootView.swift:219-223): `selection = .tasks`, with the
 *   list's date left as it was.
 *
 * Closing the dashboard is `dismiss()`: back to the chooser, or to the tabs.
 */
export default function PomodoroScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const owner = useSession((state) => state.profile?.id ?? null);
  const toTasks = async () => {
    if (from !== 'notification') return leaveWellness('tasks');
    await closePresentedScreens();
    router.navigate('/tasks');
  };
  return (
    <>
      {/* Fixed light in both modes (`.preferredColorScheme(.light)`), so the clock stays dark. */}
      <FixedLightStatusBar />
      <PomodoroView onClose={() => router.back()} onTasks={() => void toTasks()} owner={owner} store={pomodoroStore} />
    </>
  );
}
