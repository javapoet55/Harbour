import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { isValidProjectName, PROJECT_PALETTE, projectColor, projectColorName } from '../lib/projectQuery';
import { androidGroup, androidLabel, isAndroid, useTheme } from '../theme';
import { KeyboardAwareScrollView } from './keyboard';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * Port of `ProjectEditorView` (ios/App/ProjectsView.swift:112-171).
 *
 * A `Form` with a "Project name" section, a "Color" grid, an error section and a saving indicator.
 * The colour grid is `Set(palette + [color]).sorted()`, so a project saved with a colour outside the
 * palette keeps its own swatch in the grid rather than losing it on the next edit.
 */
export function ProjectEditorForm({
  name,
  color,
  onNameChange,
  onColorChange,
  saving,
  error,
  onRetry,
}: {
  name: string;
  color: string;
  onNameChange: (next: string) => void;
  onColorChange: (next: string) => void;
  saving: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const theme = useTheme();
  // `ForEach(Array(Set(ProjectQuery.palette + [color])).sorted(), id: \.self)` (ProjectsView.swift:135).
  const swatches = [...new Set([...PROJECT_PALETTE, projectColor(color)])].sort();
  const nameInvalid = name.length > 0 && !isValidProjectName(name);

  return (
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
      <Section title="Project name">
        <View style={styles.row}>
          <TextInput
            accessibilityLabel="Project name"
            placeholder="Name"
            placeholderTextColor={theme.colors.secondary}
            value={name}
            onChangeText={onNameChange}
            returnKeyType="done"
            style={[theme.typography.body, styles.input, { color: theme.colors.ink }]}
            testID="project-name"
          />
        </View>
        {nameInvalid ? (
          <View style={styles.row}>
            <Text style={[styles.caption, { color: theme.colors.danger }]} testID="project-name-error">
              Use 1–80 characters, excluding surrounding spaces.
            </Text>
          </View>
        ) : null}
      </Section>

      <Section title="Color">
        <View style={styles.swatches}>
          {swatches.map((value) => {
            const selected = projectColor(color) === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={projectColorName(value)}
                accessibilityState={{ selected }}
                onPress={() => onColorChange(value)}
                testID={`project-color-${value}`}
                style={styles.swatchHit}
              >
                <View style={[styles.swatch, { backgroundColor: value }]}>
                  {selected ? <TaskSymbol name="checkmark" size={18} color="#FFFFFF" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Section>

      {error ? (
        <Section>
          <View style={styles.row}>
            <Text style={[theme.typography.body, { color: theme.colors.danger }]} testID="project-error">
              {error}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry"
            accessibilityState={{ disabled: saving || !isValidProjectName(name) }}
            disabled={saving || !isValidProjectName(name)}
            onPress={onRetry}
            style={styles.row}
            testID="project-retry"
          >
            <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Retry</Text>
          </Pressable>
        </Section>
      ) : null}

      {saving ? (
        <View style={styles.saving}>
          <ActivityIndicator />
          <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Saving project…</Text>
        </View>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, isAndroid() && styles.androidSection]}>
      {/* iOS 26 no longer uppercases a `Form` section header — `Section("Project name")` renders as
          written. Uppercasing it is the pre-iOS-15 behaviour. Android draws the one shared field
          label, which is uppercase (docs/android-polish.md §4). */}
      {title ? (
        <Text style={[styles.sectionHeader, { color: theme.colors.secondaryLabel }, androidLabel(theme), isAndroid() && styles.androidHeader]}>{title}</Text>
      ) : null}
      {/* Android: the shared form group, as on the Moments and Shopping forms. */}
      <View style={[styles.sectionBody, { backgroundColor: theme.colors.surface }, androidGroup(theme)]} testID="project-section">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { paddingVertical: 18 },
  section: { marginBottom: 22 },
  sectionBody: { marginHorizontal: 20, borderRadius: 10, overflow: 'hidden' },
  sectionHeader: { fontSize: 13, lineHeight: 18, marginHorizontal: 36, marginBottom: 7 },
  // Android: 20 from one section to the next label, 8 from the label to its group.
  androidSection: { marginBottom: 20 },
  androidHeader: { marginBottom: 8 },
  row: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center' },
  input: { paddingVertical: 0 },
  caption: { fontSize: 12, lineHeight: 16 },
  // `LazyVGrid(columns: [GridItem(.adaptive(minimum: 48))])`, 40pt circles in 48pt hit areas.
  swatches: { flexDirection: 'row', flexWrap: 'wrap', padding: 12 },
  swatchHit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  saving: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
});
