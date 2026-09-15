import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

export type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.secondary}
        style={[
          theme.typography.body,
          styles.input,
          {
            color: theme.colors.ink,
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.separator,
            borderRadius: theme.radii.md,
            paddingHorizontal: theme.spacing.md,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1 },
});
