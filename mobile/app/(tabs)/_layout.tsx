import { router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarButton, TaskSymbol } from '../../src/components';
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
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.link,
        tabBarInactiveTintColor: theme.colors.secondary,
        // The bar needs room for the capsule: with the default height the vertical inset below
        // clipped the label. 58dp of content plus whatever the gesture bar takes.
        tabBarStyle: {
          backgroundColor: theme.colors.tabBarBackground,
          borderTopColor: theme.colors.separator,
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        // Swift draws a rounded capsule behind the selected tab. TabBarButton draws it inside the
        // button, because `tabBarActiveBackgroundColor` paints a view `tabBarItemStyle` cannot round.
        tabBarButton: (props) => <TabBarButton {...props} />,
      }}
    >
      {/* `NexdoTab.icon` (RootView.swift:81): sun.max, checkmark.circle, sparkles, calendar.
          `(today)` and `(tasks)` name a *stack*, not a screen: each tab owns a `NavigationStack` the
          way Swift does, so a pushed project or Today detail keeps the bar. See their `_layout`s. */}
      <Tabs.Screen
        name="(today)"
        options={{ title: 'Today', tabBarIcon: ({ color }) => <TaskSymbol name="sun.max" size={22} color={String(color)} /> }}
      />
      <Tabs.Screen
        name="(tasks)"
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
