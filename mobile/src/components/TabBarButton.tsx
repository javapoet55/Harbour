import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { useTheme } from '../theme';

/**
 * A tab bar item that can show Swift's rounded selection capsule.
 *
 * React Navigation's `tabBarActiveBackgroundColor` paints a view *outside* the one `tabBarItemStyle`
 * styles, so a `borderRadius` there has no effect and the capsule renders as a hard-edged rectangle
 * — `overflow: 'hidden'` does not reach it either. Drawing the capsule inside the button is the only
 * way to round it.
 *
 * Measured off the Swift app: `nexdoIndigo` at 10%, roughly a 4dp inset and an 11dp corner.
 */
export function TabBarButton({ children, style, ...rest }: PressableProps & { children?: React.ReactNode }) {
  const theme = useTheme();
  // Expo Router's BottomTabItem marks the focused tab with `aria-selected`, not
  // `accessibilityState.selected` — reading the wrong one leaves the capsule permanently hidden.
  const focused = (rest as { 'aria-selected'?: boolean })['aria-selected'] === true;

  return (
    <Pressable {...rest} style={[styles.button, style as object]}>
      <View style={[styles.pill, focused ? { backgroundColor: theme.colors.tabBarSelected } : null]}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flex: 1 },
  pill: {
    flex: 1,
    // React Navigation's own button style carries `alignItems: 'center'`, and it is spread after
    // `styles.button`, so without this the capsule shrink-wraps its icon and label instead of
    // spanning the item the way Swift's does — 35dp wide against Swift's 85dp.
    alignSelf: 'stretch',
    marginHorizontal: 4,
    marginVertical: 4,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
