import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../../src/components';
import { stackHeaderOptions, useTheme } from '../../../src/theme';

/**
 * The Tasks tab's navigation stack.
 *
 * It lives **inside** `(tabs)` so a pushed project keeps the tab bar, which is what SwiftUI does:
 * `ProjectDetailView` is reached by `NavigationLink` from the Projects segment of `TasksView`
 * (ProjectsView.swift:50, 54), so it pushes within the selected tab's `NavigationStack`.
 *
 * `(tasks)` is a **route group**, so the segment is stripped from the URL: `tasks.tsx` is still
 * `/tasks` and `project/[id]/index.tsx` is still `/project/[id]`. Putting them under a real `tasks`
 * directory instead would have rewritten every project path to `/tasks/project/…`.
 *
 * The project routes are declared here rather than in their own nested stack, because Swift has one
 * `NavigationStack` per tab and a nested one would push the detail inside a second stack that has no
 * root of its own.
 */
export default function TasksTabLayout() {
  const theme = useTheme();

  const closeButton = (label: string) => {
    function CloseButton() {
      return (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.back()} hitSlop={8}>
          <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.tint }}>{label}</Text>
        </Pressable>
      );
    }
    return CloseButton;
  };

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        ...stackHeaderOptions(theme, theme.colors.background),
      }}
    >
      {/* The tab's own root draws `TasksTopBar`, so it takes no navigation header. */}
      <Stack.Screen name="tasks" options={{ headerShown: false }} />
      {/* `ProjectDetailView` PUSHES (ProjectsView.swift:50, 54); its title and trailing menu are the
          project's, so the screen sets its own options. */}
      <Stack.Screen name="project/[id]/index" />
      {/* `ProjectEditorView` is a `.sheet` from both the list (`adding`, ProjectsView.swift:73) and
          the detail's menu (`editing`, `:276`), so `new` and `edit` are modals. */}
      <Stack.Screen
        name="project/[id]/edit"
        options={{ presentation: 'modal', title: 'Edit Project', headerLeft: closeButton('Cancel') }}
      />
      <Stack.Screen name="project/new" options={{ presentation: 'modal', title: 'Add Project', headerLeft: closeButton('Cancel') }} />
    </Stack>
  );
}
