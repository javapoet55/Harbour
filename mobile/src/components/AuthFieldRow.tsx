import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { SignInFieldIcon, type FieldIconName } from './SignInFieldIcon';

/**
 * One row inside an auth card: `HStack(spacing: 14) { SignInFieldIcon(...); field }`
 * with `.padding(.horizontal, _)` and `.frame(minHeight: _)`.
 * Sign-in uses 20/72, sign-up 18/68, verify-email 18/72.
 */
export function AuthFieldRow({
  icon,
  paddingHorizontal,
  minHeight,
  children,
}: {
  icon: FieldIconName;
  paddingHorizontal: number;
  minHeight: number;
  children: ReactNode;
}) {
  return (
    <View style={[styles.row, { paddingHorizontal, minHeight }]}>
      <SignInFieldIcon name={icon} />
      {children}
    </View>
  );
}

/** `Divider().padding(.leading, 78)` between rows of an auth card. */
export function AuthFieldDivider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 78, backgroundColor: theme.colors.separator }} />;
}

const styles = StyleSheet.create({
  // spacing: 14 between the icon and the field.
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
