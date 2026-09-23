import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCalendarNotice } from '../store/calendarNotice';
import { useSession } from '../store/session';
import { useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/** How long a note with nothing wrong stays up. A warning stays until it is dismissed. */
export const CALENDAR_NOTE_MS = 6000;

/**
 * Where a Nexdo event went after New Event or voice: the server's `calendarPush` message, the calendar
 * name, and any warnings. Shows the latest note from `useCalendarNotice`, for its own account only.
 */
export function CalendarPushNote() {
  const theme = useTheme();
  const ownerId = useSession((state) => state.profile?.id);
  const stored = useCalendarNotice((state) => state.notice);
  const clear = useCalendarNotice((state) => state.clear);
  const notice = stored && stored.ownerId === ownerId ? stored : null;

  useEffect(() => {
    if (!notice || notice.tone === 'warning') return;
    const timer = setTimeout(() => {
      // Only clear the note this timer was set for, not a newer one.
      if (useCalendarNotice.getState().notice === notice) clear();
    }, CALENDAR_NOTE_MS);
    return () => clearTimeout(timer);
  }, [notice, clear]);

  if (!notice) return null;
  const colour = notice.tone === 'warning' ? '#FF9500' : '#34C759';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.note, { backgroundColor: withAlpha(colour, 0.1), borderColor: withAlpha(colour, 0.3) }]}
      testID="calendar-push-note"
    >
      <TaskSymbol name={notice.tone === 'warning' ? 'exclamationmark.triangle.fill' : 'checkmark.circle.fill'} size={18} color={colour} />
      <View style={styles.grow}>
        <Text style={[styles.subheadline, { color: theme.colors.ink }]} testID="calendar-push-message">
          {notice.message}
        </Text>
        {notice.calendarName ? (
          <Text style={[styles.caption, { color: theme.colors.secondary }]} testID="calendar-push-calendar">
            {notice.calendarName}
          </Text>
        ) : null}
        {notice.warnings.map((warning) => (
          <Text key={warning} style={[styles.caption, { color: theme.colors.secondary }]} testID="calendar-push-warning">
            {warning}
          </Text>
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={clear} testID="calendar-push-dismiss">
        <TaskSymbol name="xmark.circle.fill" size={18} color={theme.colors.secondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1, gap: 2 },
  subheadline: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },
});
