import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../src/components';
import { stackHeaderOptions, useTheme} from '../../src/theme';

/**
 * `ProjectsView` presents its children two ways (ios/App/ProjectsView.swift):
 *
 * - `ProjectDetailView` is a `NavigationLink`, so it PUSHES (ProjectsView.swift:50, 54).
 * - `ProjectEditorView` is a `.sheet`, from both the list (`adding`, ProjectsView.swift:73) and the
 *   detail's menu (`editing`, ProjectsView.swift:276), so `new` and `edit` are modals.
 */
export default function ProjectLayout() {
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
      <Stack.Screen name="[id]/index" options={{ title: 'Project' }} />
      <Stack.Screen name="[id]/edit" options={{ presentation: 'modal', title: 'Edit Project', headerLeft: closeButton('Cancel') }} />
      <Stack.Screen name="new" options={{ presentation: 'modal', title: 'Add Project', headerLeft: closeButton('Cancel') }} />
    </Stack>
  );
}
