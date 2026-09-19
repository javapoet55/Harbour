import { Stack } from 'expo-router';

import { stackHeaderOptions, useTheme } from '../../src/theme';

/**
 * Important Moments: one `NavigationStack` of pushes, as in Swift, where `ImportantMomentsView` is
 * pushed from Today's Quick Access tile (TodayQuickAccess.swift:68) and every screen after it is a
 * `NavigationLink` or `.navigationDestination` push. Every title is `.inline`.
 *
 * PRESENTATION GAP: Swift pushes inside the Today tab, so the tab bar stays visible. These routes sit
 * OUTSIDE the tab group (like `action/`), because a moment notification opens them over any tab.
 *
 * The editor is registered twice: `editor` is a push, `import-editor` is the `.sheet` Moments Settings
 * uses for a picked contact (MomentEditor.swift:242).
 */
export default function MomentsLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Back', ...stackHeaderOptions(theme, theme.colors.groupedBackground) }}>
      <Stack.Screen name="index" options={{ title: 'Important Moments' }} />
      <Stack.Screen name="manage-list" options={{ title: 'Manage Moments' }} />
      <Stack.Screen name="editor" options={{ title: 'Create Moment' }} />
      <Stack.Screen name="import-editor" options={{ title: 'Create Moment', presentation: 'modal' }} />
      <Stack.Screen name="manage" options={{ title: 'Manage Moment' }} />
      <Stack.Screen name="review" options={{ title: 'Review Wish' }} />
      <Stack.Screen name="delivery" options={{ title: 'Choose Delivery' }} />
      <Stack.Screen name="schedule-wish" options={{ title: 'Schedule Wish' }} />
      <Stack.Screen name="wish" options={{ title: 'Wish details' }} />
      <Stack.Screen name="settings" options={{ title: 'Moments Settings' }} />
      <Stack.Screen name="calendar-import" options={{ title: 'Calendar Moments' }} />
      <Stack.Screen name="festivals" options={{ title: 'Choose Festivals' }} />
    </Stack>
  );
}
