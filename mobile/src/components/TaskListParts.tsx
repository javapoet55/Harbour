import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { brand, useTheme } from '../theme';
import type { TaskDateFilter } from '../lib/taskQuery';
import { TaskSymbol, type TaskSymbolName } from './TaskSymbol';
import { Text } from './Text';

/**
 * The small pieces of `TasksView` (ios/App/RootView.swift:1620-1907), each kept as its own component
 * so it can be render-tested. Every one is a private `var`/`func` on the Swift view rather than a
 * separate struct, so the line references below point into `TasksView` itself.
 */

/** The accent used across the Tasks screen: `LinearGradient([.nexdoIndigo, .nexdoBlue], leading→trailing)`. */
export const TASK_ACCENT = [brand.nexdoIndigo, brand.nexdoBlue] as const;

/** `TasksView.headerButton` (RootView.swift:1748-1756): a 44pt tinted square. */
export function HeaderButton({ icon, label, onPress }: { icon: TaskSymbolName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.headerButton, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06), borderColor: withAlpha(brand.nexdoIndigo, 0.14) }]}
    >
      <TaskSymbol name={icon} size={20} color={theme.colors.tint} />
    </Pressable>
  );
}

/** `TasksView.datePills` (RootView.swift:1783-1806). */
export function DatePill({
  filter,
  count,
  selected,
  onPress,
}: {
  filter: TaskDateFilter;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  // The All pill shows no count in Swift: `if filter != .all`.
  const showsCount = filter !== 'All';
  const content = (
    <>
      <Text style={[styles.pillLabel, { color: selected ? '#FFFFFF' : theme.colors.secondary }]}>{filter}</Text>
      {showsCount ? (
        <View style={[styles.pillCount, { backgroundColor: selected ? 'rgba(255,255,255,0.25)' : withAlpha(brand.nexdoIndigo, 0.08) }]}>
          <Text style={[styles.pillCountLabel, { color: selected ? '#FFFFFF' : theme.colors.secondary }]}>{String(count)}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${filter}, ${count} tasks`}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={`date-pill-${filter}`}
    >
      {selected ? (
        <LinearGradient colors={[...TASK_ACCENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.pill}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.pill, { backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(brand.nexdoIndigo, 0.16) }]}>
          {content}
        </View>
      )}
    </Pressable>
  );
}

/** `TasksView.creationCard` (RootView.swift:1812-1832). */
export function CreationCard({
  title,
  subtitle,
  icon,
  isVoice,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: TaskSymbolName;
  isVoice: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      testID={testID}
      style={[
        styles.creationCard,
        {
          backgroundColor: isVoice ? withAlpha(brand.nexdoIndigo, 0.05) : withAlpha(theme.colors.surface, 0.7),
          borderColor: withAlpha(brand.nexdoIndigo, 0.16),
        },
      ]}
    >
      {isVoice ? (
        <LinearGradient colors={[...TASK_ACCENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.creationIcon}>
          <TaskSymbol name={icon} size={24} color="#FFFFFF" />
        </LinearGradient>
      ) : (
        <View style={[styles.creationIcon, { backgroundColor: withAlpha(brand.nexdoMagenta, 0.08) }]}>
          <TaskSymbol name={icon} size={24} color={theme.colors.tint} />
        </View>
      )}
      <View style={styles.creationText}>
        <Text numberOfLines={1} style={[styles.creationTitle, { color: theme.colors.ink }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.creationSubtitle, { color: theme.colors.secondary }]}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

/** The section header row (RootView.swift:1832-1838): the title, then the count on the right. */
export function SectionHeader({ title, count }: { title: string; count: number }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.colors.ink }]}>
        {title}
      </Text>
      <Text style={[styles.sectionCount, { color: theme.colors.secondary }]}>
        {count} {count === 1 ? 'task' : 'tasks'}
      </Text>
    </View>
  );
}

/**
 * `ContentUnavailableView` (RootView.swift:1824-1830): the icon-and-title empty state with a fixed
 * description and an "Add Manually" action.
 */
export function TaskEmptyState({ title, onAdd, style }: { title: string; onAdd: () => void; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <TaskSymbol name="checklist" size={44} color={theme.colors.secondary} />
      <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.colors.secondary }]}>Try another filter or add a task.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add Manually"
        onPress={onAdd}
        style={[styles.emptyAction, { borderColor: withAlpha(brand.nexdoIndigo, 0.16), backgroundColor: withAlpha(brand.nexdoIndigo, 0.06) }]}
      >
        <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Add Manually</Text>
      </Pressable>
    </View>
  );
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  // `.padding(.horizontal, 8).frame(minHeight: 44)`, capsule.
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, minHeight: 44, borderRadius: 999 },
  pillLabel: { fontSize: 13, lineHeight: 18 },
  pillCount: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 999 },
  pillCountLabel: { fontSize: 12, lineHeight: 16 },
  // `.padding(12).frame(maxWidth: .infinity, minHeight: 72)`, corner radius 20.
  creationCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 72, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  creationIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  creationText: { flex: 1, gap: 5 },
  creationTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  creationSubtitle: { fontSize: 12, lineHeight: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 },
  // `.font(.title3.bold())`
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  sectionCount: { fontSize: 15, lineHeight: 20 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  emptyBody: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  emptyAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
});
