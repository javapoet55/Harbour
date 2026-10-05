import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassBackButton, pushedHeaderOptions } from '../../src/components/PushedHeader';
import { stackHeaderOptions, useTheme } from '../../src/theme';

/**
 * The Wellness covers (ios/App/RootView.swift:212-223, WellnessChooserView.swift:37-58). Every screen is
 * a `.fullScreenCover` in Swift, so every one is a full-screen modal here:
 *
 * - `index` — `WellnessChooserView`, from the tab bar's centre button;
 * - `guide/[kind]` — a module's "How It Works" guide, over the chooser;
 * - `pomodoro` — `PomodoroView`: the guide is replaced by it, or it opens straight over the tabs from a
 *   Pomodoro notification (`PomodoroNotificationRoute`);
 * - `calories` — the Calorie Tracker, built in Phase 12 Run D.
 *
 * Those draw their own bar, as Swift's do, so the stack header is off by default.
 *
 * Important Moments and Shopping (`moments/…`, `shopping/…`) are the module's own `NavigationStack`
 * inside the same cover (`moduleDestination`, WellnessChooserView.swift:44-58): the guide is replaced by
 * the module's first screen, so its Back returns to the chooser, and every screen after that PUSHES with
 * the iOS 26 bar, as it did in the Today stack before Phase 12. The cover hides the tab bar and the
 * chooser's own bottom bar, as the Swift captures show (`moments-date-filter-*`, `shopping-detail-store`).
 * These screens follow the phone's theme; only the chooser and the guides keep fixed light colours.
 */
export default function WellnessLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // What the Today stack gave these screens: its header defaults, then the pushed glass bar on top.
  const pushed = {
    headerShown: true,
    ...stackHeaderOptions(theme, theme.colors.background),
    ...pushedHeaderOptions(theme, insets.top),
    presentation: 'card' as const,
  };
  // A module's first screen leaves the module with a toolbar `Button` ("Back", `chevron.left`), which takes
  // the root's indigo tint (WellnessChooserView.swift:54, `moments-date-filter-today-empty`,
  // `shopping-lists-v2`); deeper pushes keep the system back, in ink.
  const moduleRoot = { ...pushed, headerLeft: () => <GlassBackButton tint={theme.colors.link} /> };

  return (
    <Stack screenOptions={{ headerShown: false, presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#FFFFFF' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="guide/[kind]" />
      <Stack.Screen name="pomodoro" />
      <Stack.Screen name="calories" />

      {/*
        Important Moments (Run B): every screen is a push with an `.inline` title, over the grouped
        background. The editor is registered twice: `editor` is a push, `import-editor` is the `.sheet`
        Moments Settings uses for a picked contact (MomentEditor.swift:242).
      */}
      <Stack.Screen name="moments/index" options={{ ...moduleRoot, title: 'Important Moments' }} />
      <Stack.Screen name="moments/manage-list" options={{ ...pushed, title: 'Manage Moments' }} />
      <Stack.Screen name="moments/editor" options={{ ...pushed, title: 'Create Moment' }} />
      <Stack.Screen
        name="moments/import-editor"
        options={{
          headerShown: true,
          ...stackHeaderOptions(theme, theme.colors.groupedBackground),
          title: 'Create Moment',
          presentation: 'modal',
        }}
      />
      <Stack.Screen name="moments/manage" options={{ ...pushed, title: 'Manage Moment' }} />
      <Stack.Screen name="moments/review" options={{ ...pushed, title: 'Review Wish' }} />
      <Stack.Screen name="moments/delivery" options={{ ...pushed, title: 'Choose Delivery' }} />
      <Stack.Screen name="moments/schedule-wish" options={{ ...pushed, title: 'Schedule Wish' }} />
      <Stack.Screen name="moments/wish" options={{ ...pushed, title: 'Wish details' }} />
      <Stack.Screen name="moments/settings" options={{ ...pushed, title: 'Moments Settings' }} />
      <Stack.Screen name="moments/calendar-import" options={{ ...pushed, title: 'Calendar Moments' }} />
      <Stack.Screen name="moments/festivals" options={{ ...pushed, title: 'Choose Festivals' }} />

      {/* Shopping Lists (Run C): `ShoppingHome` and `ShoppingDetail` push; everything else is a
          `.sheet` of those two, presented in-screen with `MomentSheet`. */}
      {/* `.navigationTitle("My Lists")` is a LARGE title (no `.inline`): drawn by the screen, the bar keeps only Back. */}
      <Stack.Screen name="shopping/index" options={{ ...moduleRoot, title: '' }} />
      <Stack.Screen name="shopping/email" options={{ ...pushed, title: 'Share List' }} />
      <Stack.Screen name="shopping/[id]" options={{ ...pushed, title: 'Shopping List' }} />
      {/* Run F: the offers screens push from Shopping Detail (ShoppingOffersView.swift:79, :118). The
          screen's own title is set from its params. */}
      <Stack.Screen name="shopping/offers" options={{ ...pushed, title: 'Offers for your list' }} />
      <Stack.Screen name="shopping/offer" options={{ ...pushed, title: 'Offer details' }} />
    </Stack>
  );
}
