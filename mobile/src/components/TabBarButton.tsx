import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { useTheme } from '../theme';

/**
 * A tab bar item that shows Swift's rounded selection capsule.
 *
 * Three things had to be worked out on the device:
 *
 * - `tabBarActiveBackgroundColor` paints a view *outside* the one `tabBarItemStyle` styles, so a
 *   `borderRadius` there has no effect. The capsule has to be drawn inside the button.
 * - Expo Router's `BottomTabItem` marks the focused tab with **`aria-selected`**, not
 *   `accessibilityState.selected`; reading the wrong one hides the capsule with nothing in the logs.
 * - The capsule is drawn as an **absolutely positioned background**, not as a wrapper around the
 *   icon and label. Wrapping them rendered as a hard-edged rectangle on Android — the corner radius
 *   was dropped — and the wrapper clipped the label's descenders. A sibling behind the content
 *   cannot clip it, and its radius is honoured.
 *
 * Measured off the Swift app: `nexdoIndigo` at 10%, a 4dp inset and an 11dp corner, and the same
 * value in dark mode over a (31, 31, 31) bar.
 */
export function TabBarButton({ children, style, ...rest }: PressableProps & { children?: React.ReactNode }) {
  const theme = useTheme();
  const focused = (rest as { 'aria-selected'?: boolean })['aria-selected'] === true;

  return (
    <Pressable {...rest} style={[styles.button, style as object]}>
      {focused ? <View pointerEvents="none" style={[styles.pill, { backgroundColor: theme.colors.tabBarSelected }]} /> : null}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flex: 1 },
  pill: { position: 'absolute', top: 4, right: 4, bottom: 4, left: 4, borderRadius: 11 },
});
