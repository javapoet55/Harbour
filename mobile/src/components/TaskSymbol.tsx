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
  'exclamationmark.circle': 'alert-circle-outline',
  'exclamationmark.triangle.fill': 'warning',
  'chart.bar.xaxis': 'stats-chart',
  'lock.shield': 'lock-closed-outline',
  'calendar.badge.checkmark': 'calendar-number-outline',
  'thermometer.medium': 'thermometer-outline',
  'sun.max.fill': 'sunny',
  'cloud.sun.fill': 'partly-sunny',
  'cloud.fill': 'cloud',
  'cloud.fog.fill': 'cloudy',
  'cloud.drizzle.fill': 'rainy-outline',
  'cloud.rain.fill': 'rainy',
  'cloud.snow.fill': 'snow',
  'cloud.bolt.rain.fill': 'thunderstorm',
  'drop.fill': 'water',
  'checkmark.circle': 'checkmark-circle-outline',
  'checkmark.square': 'checkbox-outline',
  'doc.text': 'document-text-outline',
  repeat: 'repeat',
  'mappin.and.ellipse': 'location-outline',
  'chevron.left': 'chevron-back',
  // Ask AI (Phase 6). `NexdoAIIntent.icon` (AskNexdoView.swift:25-32), the Ask header and composer,
  // `AskResponseCard` (AskResponseView.swift:86-131) and the tab bar (RootView.swift:81).
  target: 'locate-outline',
  alarm: 'alarm-outline',
  sunrise: 'sunny-outline',
  'calendar.badge.clock': 'calendar-number-outline',
  'questionmark.circle': 'help-circle-outline',
  'chevron.up': 'chevron-up',
  'speaker.wave.2.fill': 'volume-high',
  'stop.fill': 'stop',
  'stop.circle': 'stop-circle-outline',
  mic: 'mic-outline',
  'text.bubble': 'chatbubble-outline',
  'arrow.up.left': 'arrow-up-outline',
  'circle.fill': 'ellipse',
  'sun.max': 'sunny-outline',
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
