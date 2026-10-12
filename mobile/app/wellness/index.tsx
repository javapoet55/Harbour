import { WellnessChooser } from '../../src/features/wellness/WellnessChooser';
import { leaveWellness, openModuleGuide } from '../../src/features/wellness/navigation';

/**
 * `WellnessChooserView { choice in wellnessChoice = choice; showingWellness = false }` (RootView.swift:216-218).
 * Since 4185501 the chooser follows the phone's theme, so the status bar does too (the root layout's).
 */
export default function WellnessScreen() {
  return <WellnessChooser onModule={openModuleGuide} onExit={(exit) => void leaveWellness(exit)} />;
}
