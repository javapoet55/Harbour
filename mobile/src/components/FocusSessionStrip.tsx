import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { focusAccessibilityLabel, focusLabel, remainingSeconds } from '../lib/focusClock';
import { useFocus } from '../store/focus';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * Port of `FocusSessionStrip` (ios/App/FocusSessionStrip.swift:25-56).
 *
 * "A single native presentation of the existing server focus session, shared across tabs" — Swift
 * renders it from `TodayActionsView` on Today and in place of the focus button on the task detail
 * (TaskDetailsView.swift:116-117). It draws nothing when there is no session.
 *
 * `TimelineView(.periodic(from: .now, by: 1))` becomes a one-second interval, started on mount and
 * cleared on unmount so a backgrounded screen stops ticking.
 */
export function FocusSessionStrip() {
  const theme = useTheme();
  const session = useFocus((state) => state.session);
  const busy = useFocus((state) => state.busy);
  const error = useFocus((state) => state.error);
  const finishFocus = useFocus((state) => state.finishFocus);
  const clearError = useFocus((state) => state.clearError);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (session === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);

  // The "Focus session" alert (FocusSessionStrip.swift:47-49).
  useEffect(() => {
    if (error === null) return;
    Alert.alert('Focus session', error, [{ text: 'OK', style: 'cancel', onPress: clearError }]);
  }, [error, clearError]);

  if (session === null) return null;

  const remaining = remainingSeconds(session.endsAt, now);
  const finished = remaining === 0;

  const finish = () => {
    void finishFocus().catch(() => {
      Alert.alert('Focus session', 'Couldn’t save your focus time. Please try again.');
    });
  };

  return (
    <View style={[styles.strip, { backgroundColor: theme.colors.surface }]} testID="focus-strip">
      <View style={styles.text}>
        {/* Swift swaps the TITLE for "Focus finished", not the timer. */}
        <Text style={[styles.title, { color: theme.colors.ink }]} testID="focus-title">
          {finished ? 'Focus finished' : session.title}
        </Text>
        <Text
          accessibilityLabel={focusAccessibilityLabel(remaining)}
          style={[styles.clock, { color: theme.colors.ink }]}
          testID="focus-clock"
        >
          {focusLabel(remaining)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={finished ? 'Finish' : 'End focus'}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={finish}
        testID="focus-finish"
        style={styles.finish}
      >
        <Text style={[theme.typography.body, { color: theme.colors.tint }]}>{finished ? 'Finish' : 'End focus'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // `.padding(12).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 13))`
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 13 },
  text: { flex: 1, gap: 4 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  // `.monospacedDigit()`
  clock: { fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums'] },
  finish: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
