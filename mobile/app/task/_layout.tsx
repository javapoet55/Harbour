import { Stack } from 'expo-router';

import { stackHeaderOptions, useTheme} from '../../src/theme';

/**
 * Presentation matches `TasksView`'s modifiers (ios/App/RootView.swift:1697-1726):
 *
 * - `new` and `[id]` are `.sheet`s wrapping a `NavigationStack`, so both are modals. Both hide the bar and
 *   draw their own header (`new` since 9e82c95). `[id]` additionally carries `.presentationDetents([.large])`.
 * - `filters` is a `.sheet` with `[.medium, .large]` detents and a "Done" confirmation action. Expo
 *   Router has no detent API on Android, so it is a plain modal; see Visual gaps.
 * - `voice-capture` is a `.fullScreenCover` (RootView.swift:1698).
 */
export default function TaskLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        ...stackHeaderOptions(theme, theme.colors.groupedBackground),
      }}
    >
      {/* 9e82c95 `.toolbar(.hidden, for: .navigationBar)` (RootView.swift:2262-2344): the screen draws its own header,
          Close, "Create New Task" and the microphone (`creationHeader`, :2346-2387). */}
      <Stack.Screen name="new" options={{ presentation: 'modal', title: 'Create New Task', headerShown: false }} />
      {/* `TaskDetailsView(task:).toolbar(.hidden, for: .navigationBar)` (RootView.swift:2014): no bar; the screen's
          own header carries the title and its xmark. A "Close / Task" bar here gave the sheet two closes. */}
      <Stack.Screen name="[id]" options={{ presentation: 'modal', title: 'Task', headerShown: false }} />
      {/* Swift has only a confirmation "Done" here and a large title, both set by the screen. */}
      <Stack.Screen name="filters" options={{ presentation: 'modal' }} />
      {/* `AddTaskByVoiceView` draws its own "Close" and title (AddTaskByVoiceView.swift); a stack header over it
          gave the screen two bars, "Cancel" above "Close" (parity pass 4). */}
      <Stack.Screen name="voice-capture" options={{ presentation: 'fullScreenModal', title: 'Add by Voice', headerShown: false }} />
    </Stack>
  );
}
