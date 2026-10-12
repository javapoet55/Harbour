import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { NexdoProject, NexdoTask } from '../api/types';
import { taskSubtitle } from '../lib/taskLabels';
import { isDone } from '../lib/taskQuery';
import { brand, useTheme, type ColorScheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The SwiftUI system colours `taskIcon` uses, light and dark (`.pink`, `.green`, `.orange`,
 * `.purple` adapt to the scheme). `nexdoBlue` is the brand constant and does not.
 */
const SYSTEM_TINT = {
  pink: { light: '#FF2D55', dark: '#FF375F' },
  green: { light: '#34C759', dark: '#30D158' },
  orange: { light: '#FF9500', dark: '#FF9F0A' },
  purple: { light: '#AF52DE', dark: '#BF5AF2' },
} as const;

export type TaskIconTint = keyof typeof SYSTEM_TINT | 'nexdoBlue';

/**
 * The SF Symbols `taskIcon` returns, mapped to Ionicons. Drawn with Ionicons directly rather than
 * through `TaskSymbol`, whose shared map has no wrench or laptop.
 */
const TASK_ICON_GLYPH = {
  envelope: 'mail-outline',
  wrench: 'construct-outline',
  phone: 'call-outline',
  laptopcomputer: 'laptop-outline',
  calendar: 'calendar-outline',
  'doc.text': 'document-text-outline',
} as const satisfies Record<string, ComponentProps<typeof Ionicons>['name']>;

export type TaskIcon = { symbol: keyof typeof TASK_ICON_GLYPH; tint: TaskIconTint };

/**
 * `TasksView.taskIcon(_:)` (ios/App/RootView.swift:1959-1967): a glyph and tint from keywords in the
 * lowercased title, first match wins. Android ahead of iOS: Swift's `contains` is a plain substring test,
 * so "recall" got the phone; here a keyword matches a whole word, or the word with a common ending
 * ("calls", "calling", "plumber", "meetings").
 */
export function taskIcon(task: Pick<NexdoTask, 'title'>): TaskIcon {
  const words = task.title.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const has = (...stems: string[]) =>
    stems.some((stem) => words.some((word) => word === stem || (word.startsWith(stem) && ['s', 'es', 'ed', 'ing', 'er', 'ers'].includes(word.slice(stem.length)))));
  if (has('email', 'message')) return { symbol: 'envelope', tint: 'pink' };
  if (has('plumb', 'repair', 'handyman', 'electrician')) return { symbol: 'wrench', tint: 'nexdoBlue' };
  if (has('call', 'contact')) return { symbol: 'phone', tint: 'green' };
  if (has('laptop', 'computer')) return { symbol: 'laptopcomputer', tint: 'orange' };
  if (has('meeting', 'appointment')) return { symbol: 'calendar', tint: 'purple' };
  return { symbol: 'doc.text', tint: 'nexdoBlue' };
}

/** The tint's colour in a scheme. */
export function taskIconColor(tint: TaskIconTint, scheme: ColorScheme): string {
  return tint === 'nexdoBlue' ? brand.nexdoBlue : SYSTEM_TINT[tint][scheme];
}

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
  /**
   * `.accessibilityAction(named: "Move up" / "Move down")` (d568989, RootView.swift:1987-1988): the
   * reorder for people who cannot drag. Absent where the card cannot be reordered.
   */
  onMove?: (offset: -1 | 1) => void;
};

/**
 * Port of `TasksView.taskCard` (ios/App/RootView.swift:1918-1957). The Tasks tab is its only caller,
 * in Swift and here.
 *
 * NOTE: this is `taskCard`, the row the Tasks tab actually draws — NOT the `TaskRow` struct
 * (RootView.swift:1548), which is a different, glassier row used elsewhere. They are easy to confuse:
 * `TaskRow` has priority/duration/schedule badges and a 22pt glass card, while this one has a
 * keyword icon tile, a subtitle line and an 18pt surface card. The category badge went in the
 * redesign (7919779b).
 */
/** `.accessibilityHint` on a reorderable card (RootView.swift:1989). */
export const REORDER_HINT = 'Touch and hold to reorder within this date. Scheduled time stays the same.';

export function TaskCard({ task, timeZone, project, busy = false, onToggle, onOpen, onMove }: TaskCardProps) {
  const theme = useTheme();
  const done = isDone(task);
  const icon = taskIcon(task);
  const tint = taskIconColor(icon.tint, theme.scheme);

  return (
    <View
      style={[
        styles.card,
        // `.background(.background.opacity(0.8))` and `.stroke(Color.nexdoIndigo.opacity(0.05))`.
        { backgroundColor: withAlpha(theme.colors.surface, 0.8), borderColor: withAlpha(brand.nexdoIndigo, 0.05) },
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
          size={21}
          color={done ? theme.colors.link : theme.colors.secondary}
        />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityHint={onMove ? `Opens task editor. ${REORDER_HINT}` : 'Opens task editor'}
        accessibilityActions={onMove ? REORDER_ACTIONS : undefined}
        onAccessibilityAction={onMove ? (event) => onMove(event.nativeEvent.actionName === 'moveUp' ? -1 : 1) : undefined}
        onPress={onOpen}
        style={styles.body}
        testID={`task-open-${task.id}`}
      >
        {/* The 44pt icon tile: the glyph at 23pt on its tint at 11%, hidden from VoiceOver. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.iconTile, { backgroundColor: withAlpha(tint, 0.11) }]}
          testID={`task-icon-${task.id}`}
        >
          <Ionicons name={TASK_ICON_GLYPH[icon.symbol]} size={23} color={tint} testID={`task-icon-${task.id}-${icon.symbol}`} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: theme.colors.ink }, done && styles.struck]}>{task.title}</Text>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>{taskSubtitle(task, timeZone)}</Text>
          {project ? (
            <View style={styles.subtitleRow}>
              <TaskSymbol name="folder.fill" size={13} color={theme.colors.secondary} />
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>{project.name}</Text>
            </View>
          ) : null}
        </View>

        <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} />
      </Pressable>
    </View>
  );
}

/**
 * A Moment among the tasks (bb57e09, RootView.swift:1966-1981): `MomentSchedule.tasks` projects each
 * Moment into its date group as a read-only row — the type's glyph in pink on a pink 10% tile, the
 * title, "All day · <type> · Moment" and a chevron — with no checkbox and no drag. Tapping it opens
 * the Moment (`moments.route = moment`).
 */
export function MomentTaskRow({ title, type, icon, onOpen, testID }: { title: string; type: string; icon: ComponentProps<typeof Ionicons>['name']; onOpen: () => void; testID?: string }) {
  const theme = useTheme();
  const pink = SYSTEM_TINT.pink[theme.scheme];
  return (
    <Pressable
      accessibilityHint="Opens Moment"
      accessibilityLabel={`${title}, All day · ${type} · Moment`}
      accessibilityRole="button"
      onPress={onOpen}
      // `.padding(14)`, `.background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 18))`.
      style={[styles.moment, { backgroundColor: withAlpha(theme.colors.surface, 0.8) }]}
      testID={testID}
    >
      {/* `.font(.title2)` in `.pink`, 44 x 44 on `.pink.opacity(0.1)`, radius 14. */}
      <View style={[styles.iconTile, { backgroundColor: withAlpha(pink, 0.1) }]}>
        <Ionicons color={pink} name={icon} size={22} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.colors.ink }]}>{title}</Text>
        <Text style={[styles.caption, { color: theme.colors.secondary }]}>{`All day · ${type} · Moment`}</Text>
      </View>
      <TaskSymbol name="chevron.right" size={12} color={theme.colors.secondary} />
    </Pressable>
  );
}

const REORDER_ACTIONS = [
  { name: 'moveUp', label: 'Move up' },
  { name: 'moveDown', label: 'Move down' },
];

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
  // `.frame(width: 32, height: 44)` around the 21pt checkbox.
  toggle: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconTile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  text: { flex: 1, gap: 5 },
  // `.font(.subheadline.weight(.medium))`
  title: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caption: { fontSize: 12, lineHeight: 16 },
  struck: { textDecorationLine: 'line-through' },
  // `HStack(spacing: 12)` padded 14, radius 18, no stroke.
  moment: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18 },
});
