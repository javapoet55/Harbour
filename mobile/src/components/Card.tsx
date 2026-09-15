import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '../theme';

export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.separator,
          borderRadius: theme.radii.lg,
          borderWidth: StyleSheet.hairlineWidth,
          padding: theme.spacing.lg,
        },
        style,
      ]}
      {...rest}
    />
  );
}
