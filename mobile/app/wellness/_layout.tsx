import { Stack } from 'expo-router';

/**
 * The Wellness covers (ios/App/RootView.swift:212-223, WellnessChooserView.swift:37-43). Every screen is
 * a `.fullScreenCover` in Swift, so every one is a full-screen modal here:
 *
 * - `index` — `WellnessChooserView`, from the tab bar's centre button;
 * - `guide/[kind]` — a module's "How It Works" guide, over the chooser;
 * - `pomodoro` — `PomodoroView`: the guide is replaced by it, or it opens straight over the tabs from a
 *   Pomodoro notification (`PomodoroNotificationRoute`);
 * - `calories` — the Calorie Tracker, built in Phase 12 Run D.
 *
 * Every screen draws its own bar, as Swift's do, so the stack header is off.
 */
export default function WellnessLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#FFFFFF' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="guide/[kind]" />
      <Stack.Screen name="pomodoro" />
      <Stack.Screen name="calories" />
    </Stack>
  );
}
