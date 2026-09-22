import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { addDays, dayKey, startOfDay } from '../lib/taskQuery';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * The inline month grid behind "Select Date" (ios/App/RootView.swift:2038-2049).
 *
 * WHICH PICKER SWIFT USES: the system one — `DatePicker("Task date", selection:, displayedComponents: .date)`
 * with `.datePickerStyle(.graphical)`, presented in a sheet with `[.medium, .large]` detents, a
 * "Select Date" title and a "Done" confirmation button. `.graphical` renders an INLINE month grid.
 *
 * TODO(phase3-decision): this is a hand-built grid rather than `@react-native-community/datetimepicker`.
 * Swift does use the system picker, so the native dependency would be permitted, but it would force a
 * new development build AND its Android presentation is a modal dialog rather than an inline grid —
 * so it would be both costlier and less faithful to `.graphical` than this. Revisit if the iOS build
 * makes the system picker's look worth the rebuild.
 *
 * All arithmetic runs in the ACCOUNT time zone, so the highlighted day is the day the server will
 * record, not the device's day.
 */
export function MonthCalendar({
  selected,
  onSelect,
  timeZone,
  now,
  system = false,
}: {
  /** The selected instant, epoch ms. */
  selected: number;
  onSelect: (next: number) => void;
  timeZone: string;
  /** Injected by tests; read once per mount otherwise, so "today" cannot shift mid-render. */
  now?: number;
  /**
   * The SYSTEM `DatePicker`'s `.graphical` grid, as the Moments date fields show it
   * (`moment-create-date-picker`): weeks start on Sunday — the reference device's locale — with
   * three-letter uppercase day names. The Tasks screens keep Swift's explicit `firstWeekday = 2`.
   */
  system?: boolean;
}) {
  const theme = useTheme();
  const [mountedAt] = useState(() => Date.now());
  const today = now ?? mountedAt;
  const selectedDay = dayKey(selected, timeZone);
  const todayKey = dayKey(today, timeZone);

  const [year, month] = selectedDay.split('-').map(Number);
  const firstOfMonth = startOfDay(Date.UTC(year, month - 1, 1, 12), timeZone);

  // Monday-first, matching `firstWeekday = 2` on the Tasks screens; Sunday-first for the system picker.
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leading = system ? firstWeekday : (firstWeekday + 6) % 7;
  const daysInMonth = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 0)).getUTCDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const monthLabel = new Intl.DateTimeFormat('en-US', { timeZone, month: 'long', year: 'numeric' }).format(new Date(firstOfMonth));

  const step = (months: number) => {
    const target = new Date(Date.UTC(year, month - 1 + months, 1, 12));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    // Keep the day of the month where it exists; clamp into a shorter month.
    const day = Math.min(Number(selectedDay.split('-')[2]), lastDay);
    onSelect(keepTimeOfDay(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day, 12), selected, timeZone));
  };

  return (
    <View style={styles.calendar}>
      <View style={styles.monthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => step(-1)} style={styles.monthButton} testID="calendar-previous">
          <Text style={[styles.monthGlyph, { color: theme.colors.link }]}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.monthLabel, { color: theme.colors.ink }]} testID="calendar-month">
          {monthLabel}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => step(1)} style={styles.monthButton} testID="calendar-next">
          <Text style={[styles.monthGlyph, { color: theme.colors.link }]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdays}>
        {(system ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((label) => (
          <Text key={label} style={[styles.weekday, system && styles.systemWeekday, { color: theme.colors.secondary }]}>
            {system ? label : label.charAt(0)}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) return <View key={`blank-${index}`} style={styles.cell} />;
          const cellKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = cellKey === selectedDay;
          const isToday = cellKey === todayKey;
          return (
            <Pressable
              key={cellKey}
              accessibilityRole="button"
              accessibilityLabel={new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(
                new Date(Date.UTC(year, month - 1, day, 12)),
              )}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(keepTimeOfDay(Date.UTC(year, month - 1, day, 12), selected, timeZone))}
              testID={`calendar-day-${cellKey}`}
              style={styles.cell}
            >
              <View style={[styles.dayCircle, isSelected && { backgroundColor: theme.colors.tint }]}>
                <Text
                  style={[
                    styles.dayLabel,
                    { color: isSelected ? '#FFFFFF' : isToday ? theme.colors.link : theme.colors.ink },
                    isToday && !isSelected && styles.todayLabel,
                  ]}
                >
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Move to a new calendar day while keeping the time of day the current selection carries, which is
 * what `TaskCreationDate.custom` does when it resolves (`TaskSaveInput.swift:33-36`).
 */
function keepTimeOfDay(targetNoonUtc: number, current: number, timeZone: string): number {
  const time = current - startOfDay(current, timeZone);
  return startOfDay(targetNoonUtc, timeZone) + time;
}

export { addDays };

const styles = StyleSheet.create({
  calendar: { gap: 10 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  systemWeekday: { fontSize: 13, fontWeight: '600' },
  monthButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthGlyph: { fontSize: 26, lineHeight: 30, fontWeight: '600' },
  monthLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  weekdays: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 17, lineHeight: 22 },
  todayLabel: { fontWeight: '700' },
});
