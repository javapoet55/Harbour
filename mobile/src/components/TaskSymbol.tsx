import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * SF Symbol names used by the Tasks screens, mapped to the closest Ionicons glyph — the same
 * approach `SignInFieldIcon` takes for the auth screens, and recorded in the style map.
 *
 * Ionicons has no weight axis, so a SwiftUI `.font(...weight:)` on a symbol only carries the size.
 */
export const taskIcons = {
  'slider.horizontal.3': 'options-outline',
  magnifyingglass: 'search-outline',
  'xmark.circle.fill': 'close-circle',
  'mic.fill': 'mic',
  plus: 'add',
  'checkmark.circle.fill': 'checkmark-circle',
  circle: 'ellipse-outline',
  checkmark: 'checkmark',
  'chevron.right': 'chevron-forward',
  clock: 'time-outline',
  'folder.fill': 'folder',
  folder: 'folder-outline',
  checklist: 'list-outline',
  'flag.fill': 'flag',
  calendar: 'calendar-outline',
  'text.alignleft': 'text-outline',
  'arrow.right': 'arrow-forward',
  'circle.dotted': 'ellipse-outline',
  'chevron.down': 'chevron-down',
  'checkmark.square.fill': 'checkbox',
  square: 'square-outline',
  xmark: 'close',
  sparkles: 'sparkles',
} satisfies Record<string, IoniconName>;

export type TaskSymbolName = keyof typeof taskIcons;

export type TaskSymbolProps = {
  name: TaskSymbolName;
  size: number;
  color: string;
};

export function TaskSymbol({ name, size, color }: TaskSymbolProps) {
  return <Ionicons name={taskIcons[name]} size={size} color={color} />;
}
