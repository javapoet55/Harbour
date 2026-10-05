import { router, useLocalSearchParams } from 'expo-router';

import { WellnessModuleGuide } from '../../../src/features/wellness/WellnessModuleGuide';
import { continueToModule } from '../../../src/features/wellness/navigation';
import type { WellnessModule } from '../../../src/features/wellness/art';

const KINDS: WellnessModule[] = ['calories', 'pomodoro', 'moments', 'shopping'];

/**
 * `WellnessModuleEntrance` (WellnessModuleGuide.swift:133-141): the guide, then the module. "Back" and
 * "Back to Home" are both `onHome: { destination = nil }` — they return to the chooser.
 */
export default function ModuleGuideScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const module = KINDS.find((item) => item === kind);
  if (!module) return null;
  return <WellnessModuleGuide kind={module} onContinue={() => void continueToModule(module)} onHome={() => router.back()} />;
}
