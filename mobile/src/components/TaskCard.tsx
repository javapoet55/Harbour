import { Pressable, StyleSheet, View } from 'react-native';

import type { NexdoProject, NexdoTask } from '../api/types';
import { resolveCategory } from '../lib/taskCategory';
import { taskSubtitle } from '../lib/taskLabels';
import { isDone } from '../lib/taskQuery';
import { useTheme } from '../theme';
import { TaskCategoryBadge } from './TaskCategoryBadge';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

export type TaskCardProps = {
  task: NexdoTask;
  /** The account zone, used when the task carries none of its own. */
  timeZone: string;
  /** The task's project, already resolved by the caller from the projects list. */
  project?: NexdoProject;
  /** Disabled while any write is in flight, matching `model.busy` on the Swift button. */
  busy?: boolean;
  onToggle: () => void;
  onOpen: () => void;
};

/**
 * Port of `TasksView.taskCard` (ios/App/RootView.swift:1843-1876).
 *
 * NOTE: this is `taskCard`, the row the Tasks tab actually draws — NOT the `TaskRow` struct
 * (RootView.swift:1548), which is a different, glassier row used elsewhere. They are easy to confuse:
 * `TaskRow` has priority/duration/schedule badges and a 22pt glass card, while this one has a
 * category badge, a subtitle line and an 18pt surface card.
 */
export function TaskCard({ task, timeZone, project, busy = false, onToggle, onOpen }: TaskCardProps) {
  const theme = useTheme();
  const done = isDone(task);
  const category = resolveCategory(task.title, task.category?.name);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: withAlpha(theme.colors.secondary, 0.16) },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${done ? 'Restore' : 'Complete'} ${task.title}`}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onToggle}
        style={styles.toggle}
        testID={`task-toggle-${task.id}`}
      >
        <TaskSymbol
          name={done ? 'checkmark.circle.fill' : 'circle'}
          size={25}
          color={done ? theme.colors.tint : theme.colors.secondary}
        />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens task editor"
        onPress={onOpen}
        style={styles.body}
        testID={`task-open-${task.id}`}
      >
        <View style={styles.text}>
          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.ink },
              done && styles.struck,
            ]}
          >
            {task.title}
          </Text>
          <View style={styles.subtitleRow}>
            <TaskSymbol name="clock" size={13} color={theme.colors.secondary} />
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>{taskSubtitle(task, timeZone)}</Text>
          </View>
          {project ? (
            <View style={styles.subtitleRow}>
              <TaskSymbol name="folder.fill" size={13} color={theme.colors.secondary} />
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>{project.name}</Text>
            </View>
          ) : null}
        </View>

        {/*
          Swift caps the badge at 120pt and moves it below the text at accessibility sizes
          (RootView.swift:1866-1871). The size-class switch is not reproduced; see Visual gaps.
        */}
        <TaskCategoryBadge appearance={category} style={styles.badge} />
        <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} />
      </Pressable>
    </View>
  );
}

/** `Color.opacity` on a hex or rgba token. */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  // `.padding(.horizontal, 10).padding(.vertical, 10)`, `minHeight: 66`, corner radius 18.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 66,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  text: { flex: 1, gap: 5 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caption: { fontSize: 12, lineHeight: 16 },
  struck: { textDecorationLine: 'line-through' },
  badge: { maxWidth: 120 },
});
