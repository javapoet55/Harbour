import type { Theme } from './useTheme';

/**
 * The header options every stack that draws a navigation bar should spread.
 *
 * The one that matters on Android is `headerTitleAlign: 'center'`. React Navigation left-aligns a
 * header title on Android by Material convention, and iOS centres it — so a screen with a custom
 * `headerLeft` renders the button and the title jammed together ("CloseNew Task" on the task
 * editor). SwiftUI's `.navigationBarTitleDisplayMode(.inline)` is always centred, so centring here
 * is what matches the reference on both platforms.
 *
 * `background` picks the surface the bar sits on: the grouped background for a `Form`-style screen,
 * `background` for a plain one.
 */
export function stackHeaderOptions(theme: Theme, background: string) {
  return {
    headerTintColor: theme.colors.link,
    headerTitleStyle: { color: theme.colors.ink, fontSize: 17, fontWeight: '600' as const },
    headerStyle: { backgroundColor: background },
    contentStyle: { backgroundColor: background },
    headerShadowVisible: false,
    headerTitleAlign: 'center' as const,
  };
}
