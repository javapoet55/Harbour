import { Stack } from 'expo-router';

import { useTheme } from '../../src/theme';

/**
 * Ask AI's presentation, matching Swift:
 *
 * - `index` is Ask. `NexdoTabShell` presents it with `.fullScreenCover(isPresented: $showingAsk)`
 *   (ios/App/RootView.swift:162-168); the detents written under it do nothing on a full-screen cover.
 * - `voice` is `.fullScreenCover(isPresented: $showingVoice) { AddTaskByVoiceView(askMode: true) }`
 *   (AskNexdoView.swift:340).
 * - `brief/[index]` is a Daily Brief section page, `.fullScreenCover(item: $selectedSection)`
 *   (DailyBriefView.swift:106).
 *
 * "Free form Text" (`showingText`, AskNexdoView.swift:341) has no route: nothing in Swift sets it now
 * that the entry cards are gone. Every screen draws its own header, so the stack header is off.
 */
export default function AskLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="index" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="voice" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="brief/[index]" options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#FFFFFF' } }} />
    </Stack>
  );
}
