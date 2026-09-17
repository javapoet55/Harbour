import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

/**
 * The bar pinned to the bottom of a sheet — "Create Task", "Save", "Apply" and friends.
 *
 * SwiftUI puts this inside the safe area, so the button always clears the home indicator. React
 * Native does not, and on an Android phone with gesture navigation the button rendered *underneath*
 * the navigation bar: on the task editor the "Create Task" label sat behind the back/home/recents
 * controls and could not be tapped. Every pinned footer needs the bottom inset, so it lives here
 * rather than in each screen.
 */
export function StickyFooter({
  children,
  style,
  /** Most footers sit on `surface`; a few inherit the screen's own background. */
  background,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  background?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.footer,
        { borderTopColor: theme.colors.separator },
        background ? { backgroundColor: background } : null,
        style,
        { paddingBottom: styles.footer.paddingVertical + insets.bottom },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
