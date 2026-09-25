import { StyleSheet, View } from 'react-native';

import { TaskSymbol, type TaskSymbolName } from './TaskSymbol';
import { Text } from './Text';

export type TaskBadgeProps = {
  title: string;
  icon: TaskSymbolName;
  color: string;
};

/**
 * Port of `TaskBadge` (ios/App/RootView.swift:2123-2137).
 *
 * Used by `TaskRow`, not by the Tasks tab's own row. Ported here because it is a listed Phase 3
 * shared component and Phase 4's Today list draws it.
 */
export function TaskBadge({ title, icon, color }: TaskBadgeProps) {
  return (
    <View style={[styles.capsule, { backgroundColor: withAlpha(color, 0.09) }]}>
      <TaskSymbol name={icon} size={9} color={color} />
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {title}
      </Text>
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  capsule: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  // `.font(.system(size: 9, weight: .bold))`
  label: { fontSize: 9, lineHeight: 12, fontWeight: '700' },
});
