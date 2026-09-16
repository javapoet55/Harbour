import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../../src/components';
import { ProjectEditorForm } from '../../../src/components/ProjectEditorForm';
import { isValidProjectName } from '../../../src/lib/projectQuery';
import type { NexdoProject } from '../../../src/api/types';
import { useProject, useProjects, useUpdateProject } from '../../../src/query/useProjects';
import { useTheme } from '../../../src/theme';

/**
 * `ProjectEditorView(project:)` (ios/App/ProjectsView.swift:112-171), presented as a sheet.
 *
 * Swift's initialiser receives an already-loaded `NexdoProject` and seeds `name` and `color` from it
 * (ProjectsView.swift:120-124). Here the project has to come out of the cache, which may still be
 * loading on the first render — so the form is not mounted until there is a project to seed it with.
 * Seeding `useState` from an undefined project instead would leave the fields permanently blank.
 */
export default function EditProject() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const projects = useProjects();
  const project = useProject(id);

  if (!project) {
    return (
      <View style={[styles.fill, styles.centre, { backgroundColor: theme.colors.groupedBackground }]}>
        {projects.isLoading ? (
          <>
            <ActivityIndicator />
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Loading projects…</Text>
          </>
        ) : (
          <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>This project is no longer in your list.</Text>
        )}
      </View>
    );
  }

  // Keyed on the project id so switching projects re-seeds the buffer.
  return <EditProjectForm key={project.id} project={project} />;
}

function EditProjectForm({ project }: { project: NexdoProject }) {
  const theme = useTheme();
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateProject();
  const canSave = !update.isPending && isValidProjectName(name);

  const save = () => {
    if (!canSave) return;
    setError(null);
    update.mutate(
      { id: project.id, input: { name: name.trim(), color } },
      { onSuccess: () => router.back(), onError: (cause) => setError(cause.message) },
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      <ProjectEditorForm
        name={name}
        color={color}
        onNameChange={setName}
        onColorChange={setColor}
        saving={update.isPending}
        error={error}
        onRetry={save}
      />
      <View style={[styles.footer, { borderTopColor: theme.colors.separator }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={save}
          style={styles.done}
          testID="project-done"
        >
          <Text style={[theme.typography.body, { color: canSave ? theme.colors.tint : theme.colors.secondary }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20 },
  done: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
});
