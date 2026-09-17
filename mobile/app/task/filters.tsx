import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { TaskSymbol, Text } from '../../src/components';
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
 *
 * Three things here are deliberate and were wrong before:
 *
 * - Swift's `Form` has **no `Section` headers**. This screen used to invent "STATUS" and "PRIORITY"
 *   headers and list every option under them, which is why it measured 80% different.
 * - `Picker` inside a `Form` is a *row* carrying the current value, not an expanded list. React
 *   Native has no native picker (a recorded gap), so the row expands in place — but it is collapsed
 *   until tapped, so the resting shape matches.
 * - `.navigationTitle` here is **not** `.inline` (compare the project editor, which sets it), so iOS
 *   draws a large title. `headerLargeTitle` is iOS-only in React Navigation, so it is drawn as
 *   content and the header title is left empty.
 */
export default function TaskFilters() {
  const theme = useTheme();
  const query = useTaskQuery((state) => state.query);
  const setQuery = useTaskQuery((state) => state.setQuery);
  const resetFilters = useTaskQuery((state) => state.resetFilters);
  const tasks = useTasks();
  const [open, setOpen] = useState<'status' | 'priority' | null>(null);

  const priorities = [...new Set((tasks.data?.tasks ?? []).map((task) => task.priority))].sort();
  const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      {/* `.toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") } }`
          (RootView.swift:1722). Swift has no Cancel here — the sheet's drag dismisses it. */}
      <Stack.Screen
        options={{
          title: '',
          headerBackVisible: false,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => router.back()} hitSlop={8} testID="filters-done">
              <Text style={[theme.typography.body, { color: theme.colors.tint, fontWeight: '600' }]}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.form}>
        <Text accessibilityRole="header" style={[styles.largeTitle, { color: theme.colors.ink }]}>
          Task filters
        </Text>

        <View style={[styles.sectionBody, { backgroundColor: theme.colors.surface }]}>
          <PickerRow
            label="Status"
            value={query.status}
            expanded={open === 'status'}
            onPress={() => setOpen((current) => (current === 'status' ? null : 'status'))}
            testID="filter-status"
          />
          {open === 'status'
            ? (['Open', 'Completed', 'All'] as const).map((status) => (
                <OptionRow
                  key={status}
                  label={status}
                  selected={query.status === status}
                  onPress={() => {
                    setQuery({ status });
                    setOpen(null);
                  }}
                  testID={`status-${status}`}
                />
              ))
            : null}

          <PickerRow
            label="Priority"
            value={query.priority === 'All' ? 'All' : label(query.priority)}
            expanded={open === 'priority'}
            onPress={() => setOpen((current) => (current === 'priority' ? null : 'priority'))}
            testID="filter-priority"
          />
          {open === 'priority' ? (
            <>
              <OptionRow
                label="All"
                selected={query.priority === 'All'}
                onPress={() => {
                  setQuery({ priority: 'All' });
                  setOpen(null);
                }}
                testID="priority-All"
              />
              {priorities.map((priority) => (
                <OptionRow
                  key={priority}
                  // `Text($0.capitalized)` (RootView.swift:1712)
                  label={label(priority)}
                  selected={query.priority === priority}
                  onPress={() => {
                    setQuery({ priority });
                    setOpen(null);
                  }}
                  testID={`priority-${priority}`}
                />
              ))}
            </>
          ) : null}

          {/* `if model.taskQuery.date != .all { Toggle(...) }` (RootView.swift:1715) — a `Toggle` is a
              switch, not a checkmark row. */}
          {query.date !== 'All' ? (
            <View style={[styles.row, styles.divider, { borderBottomColor: theme.colors.separator }]}>
              <Text style={[theme.typography.body, styles.rowLabel, { color: theme.colors.ink }]}>Earliest due first</Text>
              {/* `.tint(.nexdoIndigo)` is applied at the root (RootView.swift:46), so a `Toggle`
                  is indigo, not Android's default teal. */}
              <Switch
                accessibilityLabel="Earliest due first"
                value={query.earliestFirst}
                onValueChange={(next) => setQuery({ earliestFirst: next })}
                trackColor={{ false: theme.colors.separator, true: theme.colors.tint }}
                thumbColor="#FFFFFF"
                testID="earliest-first"
              />
            </View>
          ) : null}

          <Pressable accessibilityRole="button" accessibilityLabel="Reset filters" onPress={resetFilters} style={styles.row} testID="reset-filters">
            <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Reset filters</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

/** A `Picker` in a `Form`: the label, the current value, and the up/down chevron. */
function PickerRow({
  label,
  value,
  expanded,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  expanded: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ expanded }}
      onPress={onPress}
      testID={testID}
      style={[styles.row, styles.divider, { borderBottomColor: theme.colors.separator }]}
    >
      <Text style={[theme.typography.body, styles.rowLabel, { color: theme.colors.ink }]}>{label}</Text>
      <Text style={[theme.typography.body, { color: theme.colors.secondaryLabel }]}>{value}</Text>
      <TaskSymbol name="chevron.up.chevron.down" size={13} color={theme.colors.secondaryLabel} />
    </Pressable>
  );
}

function OptionRow({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={[styles.row, styles.option, styles.divider, { borderBottomColor: theme.colors.separator }]}
    >
      <Text style={[theme.typography.body, styles.rowLabel, { color: theme.colors.ink }]}>{label}</Text>
      {selected ? <TaskSymbol name="checkmark" size={16} color={theme.colors.tint} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { paddingBottom: 18 },
  // `.navigationTitle` at its default (large) display mode.
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', marginHorizontal: 20, marginBottom: 18 },
  sectionBody: { marginHorizontal: 20, borderRadius: 10, overflow: 'hidden' },
  row: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  option: { paddingLeft: 32 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { flex: 1 },
});
