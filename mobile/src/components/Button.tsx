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
  // RESOLVED (Phase 2): the Swift primary button's magenta→indigo→blue gradient lives in
  // `GradientButton`, which every real screen uses. This one stays solid and now backs only
  // `ErrorView`'s secondary "Try again".
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
