import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, style, testID }: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  // TODO(phase1-decision): the Swift primary button is a magenta→indigo→blue gradient; solid indigo until
  // expo-linear-gradient is added with the auth screens.
  const container: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: theme.colors.tint }
      : variant === 'secondary'
        ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.tint }
        : { backgroundColor: 'transparent' };
  const tone = variant === 'primary' ? 'onTint' : 'tint';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { borderRadius: theme.radii.md, paddingHorizontal: theme.spacing.lg },
        container,
        (pressed || disabled) && styles.dimmed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator testID={testID ? `${testID}-spinner` : undefined} color={theme.colors[tone]} />
      ) : (
        <Text variant="body" tone={tone} style={styles.label}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '600' },
  dimmed: { opacity: 0.6 },
});
