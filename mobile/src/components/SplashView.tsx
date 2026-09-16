import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { NexdoLogoMark } from './NexdoLogoMark';

/**
 * Shown while the launch `GET /api/me` is still deciding. It deliberately uses the same background and
 * logo mark as the sign-in screen, so a signed-out launch settles into sign-in without a colour flash,
 * and a signed-in launch never shows the sign-in screen at all.
 */
export function SplashView() {
  const theme = useTheme();
  return (
    <View accessibilityLabel="Loading Nexdo" style={[styles.center, { backgroundColor: theme.colors.background }]}>
      <NexdoLogoMark width={116} height={84} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
