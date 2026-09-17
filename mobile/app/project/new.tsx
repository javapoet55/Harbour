import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StickyFooter, Text } from '../../src/components';
import { ProjectEditorForm } from '../../src/components/ProjectEditorForm';
import { isValidProjectName, PROJECT_PALETTE } from '../../src/lib/projectQuery';
import { useCreateProject } from '../../src/query/useProjects';
import { useTheme } from '../../src/theme';

/** `ProjectEditorView(project: nil)` (ios/App/ProjectsView.swift:112-171), presented as a sheet. */
export default function NewProject() {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PROJECT_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateProject();
  const canSave = !create.isPending && isValidProjectName(name);

  const save = () => {
    if (!canSave) return;
    setError(null);
    create.mutate(
      { name: name.trim(), color },
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
        saving={create.isPending}
        error={error}
        onRetry={save}
      />
      <StickyFooter>
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
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20 },
  done: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
});
