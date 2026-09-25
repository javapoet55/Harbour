import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

export function LoadingView({ message }: { message?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.colors.groupedBackground, gap: theme.spacing.md }]}>
      <ActivityIndicator color={theme.colors.link} />
      {message ? <Text tone="secondary">{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
