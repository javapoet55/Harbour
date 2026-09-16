import { Tabs } from 'expo-router';

import { TaskSymbol } from '../../src/components';
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
        // TODO(phase6): Today, Tasks and Ask AI still show labels only. `NexdoTab.icon`
        // (RootView.swift:81) gives them "sun.max", "checkmark.circle" and "sparkles"; the Calendar
        // tab is the only one Phase 5 owns.
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      {/* Opens a sheet in the Swift app; a tab until Phase 6. */}
      <Tabs.Screen name="ask" options={{ title: 'Ask AI' }} />
      {/* `NexdoTab.calendar.icon` is the SF Symbol "calendar" (RootView.swift:81). */}
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <TaskSymbol name="calendar" size={22} color={String(color)} />,
        }}
      />
    </Tabs>
  );
}
