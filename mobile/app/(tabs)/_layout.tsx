import { router, Tabs } from 'expo-router';

import { TaskSymbol } from '../../src/components';
import { useTheme } from '../../src/theme';

/**
 * `NexdoTabShell` (ios/App/RootView.swift:84-190) and `NexdoTab` (`:77-82`).
 *
 * Ask AI IS NOT A TAB in the Swift app. `NexdoTab.askAI` has a tab-bar item, but tapping it runs
 * `if tab == .askAI { showingAsk = true }` (RootView.swift:120) — it presents `AskNexdoView` as a
 * sheet over whatever tab is showing and leaves `selection` untouched. `tabPress` is intercepted here
 * for the same reason: the press opens `/ask` and never selects the screen behind it.
 */
export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.tint,
        tabBarInactiveTintColor: theme.colors.secondary,
        tabBarStyle: { backgroundColor: theme.colors.background, borderTopColor: theme.colors.separator },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      {/* `NexdoTab.icon` (RootView.swift:81): sun.max, checkmark.circle, sparkles, calendar. */}
      <Tabs.Screen
        name="today"
        options={{ title: 'Today', tabBarIcon: ({ color }) => <TaskSymbol name="sun.max" size={22} color={String(color)} /> }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color }) => <TaskSymbol name="checkmark.circle" size={22} color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{ title: 'Ask AI', tabBarIcon: ({ color }) => <TaskSymbol name="sparkles" size={22} color={String(color)} /> }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push('/ask');
          },
        }}
      />
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
