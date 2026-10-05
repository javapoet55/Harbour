import { WellnessChooser } from '../../src/features/wellness/WellnessChooser';
import { leaveWellness, openModuleGuide } from '../../src/features/wellness/navigation';

/** `WellnessChooserView { choice in wellnessChoice = choice; showingWellness = false }` (RootView.swift:216-218). */
export default function WellnessScreen() {
  return <WellnessChooser onModule={openModuleGuide} onExit={(exit) => void leaveWellness(exit)} />;
}
