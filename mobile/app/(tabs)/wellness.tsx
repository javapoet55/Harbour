import { Redirect } from 'expo-router';

/**
 * UNREACHABLE by design, like `ask.tsx`: the tab bar's centre Wellness button opens the chooser cover
 * (`showingWellness = true`, ios/App/RootView.swift:175) and never selects a tab. The route exists only
 * so `Tabs.Screen name="wellness"` can render that button; a deep link here forwards to the cover.
 */
export default function WellnessTab() {
  return <Redirect href="/wellness" />;
}
