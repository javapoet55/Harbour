import { Stack } from 'expo-router';

import { useTheme } from '../../src/theme';

/**
 * Ask AI's presentation, matching Swift exactly:
 *
 * - `index` is the Ask sheet. `NexdoTabShell` presents it with `.sheet(isPresented: $showingAsk)`,
 *   `.presentationDetents([.fraction(0.84)])` and a drag indicator (ios/App/RootView.swift:110-115).
 * - `text` is `.fullScreenCover(isPresented: $showingText) { AskNexdoView(textPage: true) }`
 *   (AskNexdoView.swift:271).
 * - `voice` is `.fullScreenCover(isPresented: $showingVoice) { AddTaskByVoiceView(askMode: true) }`
 *   (AskNexdoView.swift:270).
 *
 * Every screen draws its own header — Swift's is inside `body`, not a navigation bar — so the stack
 * header is off throughout. Expo Router has no detent API on Android, so the 0.84 fraction is a
 * full-height modal; see Visual gaps.
 */
export default function AskLayout() {
  const theme = useTheme();
  // `index` is a `.sheet`, so iOS resolves its background one level up (style map section 3);
  // `text` and `voice` are `.fullScreenCover`s, which do not elevate. `AskNexdoView` makes the
  // same distinction with `useTheme({ elevated: !textPage })`, and the two must agree.
  const sheet = useTheme({ elevated: true });
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="index" options={{ presentation: 'modal', contentStyle: { backgroundColor: sheet.colors.background } }} />
      <Stack.Screen name="text" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="voice" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
