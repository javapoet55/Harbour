import { router, useLocalSearchParams } from 'expo-router';

import { CalorieTracker } from '../../src/features/nutrition/CalorieTracker';
import { useSession } from '../../src/store/session';

/**
 * `CalorieTrackerView(api: model.profile == nil ? nil : model.momentAPI)` (WellnessChooserView.swift:50):
 * live with the signed-in account. The chooser is only reachable signed in, so the sample preview is
 * Swift's DEBUG `-calorie-design-preview` here: a development build opens it with `?preview=1`.
 */
export default function CalorieTrackerScreen() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const signedIn = useSession((state) => state.profile != null);
  const live = signedIn && !(__DEV__ && preview === '1');
  return <CalorieTracker live={live} onClose={() => router.back()} />;
}
