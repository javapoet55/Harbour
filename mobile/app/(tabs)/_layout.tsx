import { Tabs } from 'expo-router';

import { useTheme } from '../../src/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.tint,
        tabBarInactiveTintColor: theme.colors.secondary,
        tabBarStyle: { backgroundColor: theme.colors.background, borderTopColor: theme.colors.separator },
        // Icons come with the Today/Tasks phases; labels only for now.
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      {/* Opens a sheet in the Swift app; a tab until Phase 6. */}
      <Tabs.Screen name="ask" options={{ title: 'Ask AI' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
    </Tabs>
  );
}
