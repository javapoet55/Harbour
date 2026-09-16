import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../src/components';
import { useTasks } from '../../src/query/useTasks';
import { useTaskQuery } from '../../src/store/taskQuery';
import { useTheme } from '../../src/theme';

/**
 * Port of the filter sheet (ios/App/RootView.swift:1705-1726).
 *
 * It is a `Form` presented as a sheet with `.medium`/`.large` detents, holding exactly four controls:
 * Status, Priority, an "Earliest due first" toggle shown only when the date filter is not All, and a
 * Reset button. The brief's energy / project / tags / due-range filters do not exist in Swift.
 *
 * The priority options are derived from the tasks actually loaded
 * (`Set(model.tasks.map(\.priority)).sorted()`, RootView.swift:1711), not from a fixed list.
 */
export default function TaskFilters() {
  const theme = useTheme();
  const query = useTaskQuery((state) => state.query);
  const setQuery = useTaskQuery((state) => state.setQuery);
  const resetFilters = useTaskQuery((state) => state.resetFilters);
  const tasks = useTasks();

  const priorities = [...new Set((tasks.data?.tasks ?? []).map((task) => task.priority))].sort();

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      <ScrollView contentContainerStyle={styles.form}>
        <Section title="Status">
          {(['Open', 'Completed', 'All'] as const).map((status, index, all) => (
            <Row
              key={status}
              label={status}
              selected={query.status === status}
              last={index === all.length - 1}
              onPress={() => setQuery({ status })}
              testID={`status-${status}`}
            />
          ))}
        </Section>

        <Section title="Priority">
          <Row label="All" selected={query.priority === 'All'} onPress={() => setQuery({ priority: 'All' })} testID="priority-All" />
          {priorities.map((priority, index, all) => (
            <Row
              key={priority}
              // `Text($0.capitalized)` (RootView.swift:1712)
              label={priority.charAt(0) + priority.slice(1).toLowerCase()}
              selected={query.priority === priority}
              last={index === all.length - 1}
              onPress={() => setQuery({ priority })}
              testID={`priority-${priority}`}
            />
          ))}
        </Section>

        {/* `if model.taskQuery.date != .all { Toggle(...) }` (RootView.swift:1715) */}
        {query.date !== 'All' ? (
          <Section>
            <Row
              label="Earliest due first"
              selected={query.earliestFirst}
              last
              onPress={() => setQuery({ earliestFirst: !query.earliestFirst })}
              testID="earliest-first"
            />
          </Section>
        ) : null}

        <Section>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset filters" onPress={resetFilters} style={styles.row} testID="reset-filters">
            <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Reset filters</Text>
          </Pressable>
        </Section>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.separator }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => router.back()} style={styles.row} testID="filters-done">
          <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      {title ? <Text style={[styles.sectionHeader, { color: theme.colors.secondary }]}>{title.toUpperCase()}</Text> : null}
      <View style={[styles.sectionBody, { backgroundColor: theme.colors.surface }]}>{children}</View>
    </View>
  );
}

function Row({
  label,
  selected,
  last = false,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  last?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }]}
    >
      <Text style={[theme.typography.body, styles.rowLabel, { color: theme.colors.ink }]}>{label}</Text>
      {selected ? <Text style={[theme.typography.body, { color: theme.colors.tint }]}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { paddingVertical: 18 },
  section: { marginBottom: 22 },
  sectionBody: { marginHorizontal: 20, borderRadius: 10, overflow: 'hidden' },
  sectionHeader: { fontSize: 13, lineHeight: 18, marginHorizontal: 36, marginBottom: 7 },
  row: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center' },
  rowLabel: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20 },
});
