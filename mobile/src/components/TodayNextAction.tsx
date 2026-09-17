import { Pressable, StyleSheet, View } from 'react-native';

import type { DoNowChoice, ProtectedTimeProposal } from '../api';
import { durationLabel, protectedTimeLabel } from '../query/useNextAction';
import { brand, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * Sections 7 and 8 of `TodayView.body`: the protected-time proposal (**RootView.swift:1095-1106**)
 * and the persistent next-action card (**RootView.swift:1108-1126**).
 *
 * Both are `range == .today` only, both are the same indigo-tinted card, and both disappear the
 * moment their server data does. Deferred from Phase 4B and re-marked Phase 9 because they need the
 * next-action service rather than the action coordinator.
 */

/** `if range == .today, let proposal = model.protectedTime` (RootView.swift:1095-1106). */
export function ProtectedTimeCard({
  proposal,
  timeZone,
  busy,
  onRespond,
}: {
  proposal: ProtectedTimeProposal;
  timeZone: string;
  /** `model.protectingTime` (`:1103`): both buttons are disabled while either is in flight. */
  busy: boolean;
  onRespond: (accept: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06) }]} testID="today-protected-time">
      <View style={styles.row}>
        <TaskSymbol color={theme.colors.ink} name="lock.shield" size={17} />
        <Text style={[styles.headline, { color: theme.colors.ink }]}>Make room for important work</Text>
      </View>
      <Text style={[styles.subheadline, { color: theme.colors.ink }]}>
        {`You’ve postponed ${proposal.title} ${proposal.postponeCount} times.`}
      </Text>
      <Text style={[theme.typography.body, { color: theme.colors.ink }]}>
        {`Reserve ${proposal.durationMin} minutes at ${protectedTimeLabel(proposal.startAt, timeZone)}?`}
      </Text>
      <Text style={[styles.caption, { color: theme.colors.secondary }]}>
        Nexdo will keep this block in place during replanning. You can still move it yourself.
      </Text>
      <View style={styles.buttons}>
        <Pressable
          accessibilityLabel="Reserve time"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => onRespond(true)}
          style={[styles.prominent, { backgroundColor: theme.colors.tint, opacity: busy ? 0.55 : 1 }]}
          testID="today-protected-accept"
        >
          <Text style={[theme.typography.body, { color: '#FFFFFF' }]}>Reserve time</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Not now"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => onRespond(false)}
          style={[styles.plain, { opacity: busy ? 0.55 : 1 }]}
          testID="today-protected-decline"
        >
          <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * `if range == .today, let recommendation = model.persistentNext?.recommendation, let best =
 * recommendation.nextAction?.bestAction` (RootView.swift:1108-1126).
 */
export function PersistentNextCard({
  best,
  availableWindowMinutes,
  canStart,
  busy,
  onDismiss,
  onStart,
  onOtherOptions,
}: {
  best: DoNowChoice;
  availableWindowMinutes: number;
  /** `recommendation.canStart` (`:1122`). */
  canStart: boolean;
  /** `model.busy`. */
  busy: boolean;
  onDismiss: () => void;
  onStart: () => void;
  onOtherOptions: () => void;
}) {
  const theme = useTheme();
  const startDisabled = !canStart || busy;
  return (
    <View style={[styles.card, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06) }]} testID="today-next-action">
      <View style={styles.row}>
        <Text style={[styles.headline, styles.grow, { color: theme.colors.ink }]}>What should I do now?</Text>
        <Pressable
          accessibilityLabel="Dismiss suggestion"
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.dismiss}
          testID="today-next-action-dismiss"
        >
          <TaskSymbol color={theme.colors.secondary} name="xmark" size={17} />
        </Pressable>
      </View>
      <Text style={[styles.title3, { color: theme.colors.ink }]}>{best.title}</Text>
      <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
        {`~${best.focusMinutes} min · ${durationLabel(availableWindowMinutes)} available`}
      </Text>
      <Pressable
        accessibilityLabel="Start Focus Session"
        accessibilityRole="button"
        accessibilityState={{ disabled: startDisabled }}
        disabled={startDisabled}
        onPress={onStart}
        style={[styles.prominent, { backgroundColor: theme.colors.tint, opacity: startDisabled ? 0.55 : 1 }]}
        testID="today-next-action-start"
      >
        <Text style={[theme.typography.body, { color: '#FFFFFF' }]}>Start Focus Session</Text>
      </Pressable>
      <Pressable accessibilityLabel="Other options" accessibilityRole="button" onPress={onOtherOptions} style={styles.plain} testID="today-next-action-other">
        <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Other options</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },

  // `.padding(18)` with corner radius 20.
  card: { gap: 10, padding: 18, borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prominent: { minHeight: 44, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plain: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  dismiss: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
