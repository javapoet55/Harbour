import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export type ErrorViewProps = {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
};

export function ErrorView({ error, title = 'Something went wrong', onRetry, retrying }: ErrorViewProps) {
  const theme = useTheme();
  const message = error instanceof Error ? error.message : 'Please try again.';
  return (
    <View style={[styles.center, { backgroundColor: theme.colors.groupedBackground, gap: theme.spacing.md, padding: theme.spacing.xl }]}>
      <Text variant="title" style={styles.text}>
        {title}
      </Text>
      <Text tone="secondary" style={styles.text}>
        {message}
      </Text>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} loading={retrying} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
});
