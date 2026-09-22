import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DoNowChoice, ProtectedTimeProposal } from '../api';
import { protectedTimeLabel } from '../query/useNextAction';
import { brand, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * Two sections of `TodayView.body`: the protected-time proposal (**RootView.swift:1102-1113**) and
 * the "Focus next" card (**RootView.swift:1115-1144**, `focusStartButton` `:1205-1215`).
 *
 * Both are `range == .today` only and both are the same indigo-tinted card. The proposal disappears
 * with its server data; since 63d9542 the Focus next card stays, with an empty state.
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
          <Text style={[theme.typography.body, { color: theme.colors.link }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The "Focus next" card (RootView.swift:1115-1144, commit 63d9542), which replaced both the
 * "What should I do now?" card and the intelligence card's "What should I do now?" button.
 *
 * It is shown on the Today range whether or not there is a recommendation: with one, its title,
 * "N min · Fits your free time" and "Start focus"; without one, "Find my next task". "Other options"
 * and "Dismiss suggestion" sit in the "…" `Menu` in the header, and "Other options" is also beside
 * "Start focus".
 *
 * The `Menu` has no React Native equivalent, so it opens as an inline list under the header — the
 * substitution the project detail and task detail menus already use.
 */
export function FocusNextCard({
  best,
  canStart,
  busy,
  onDismiss,
  onStart,
  onOtherOptions,
}: {
  /** `model.persistentNext?.recommendation?.nextAction?.bestAction`, or null for the empty state. */
  best: DoNowChoice | null;
  /** `recommendation.canStart` (`:1124`). */
  canStart: boolean;
  /** `model.busy` (`:1214`). */
  busy: boolean;
  onDismiss: () => void;
  onStart: () => void;
  onOtherOptions: () => void;
}) {
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  // `.disabled(model.persistentNext?.recommendation?.canStart != true || model.busy)` (`:1214`).
  const startDisabled = !canStart || busy;

  const choose = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <View
      style={[styles.focusCard, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06), borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}
      testID="today-focus-next"
    >
      <View style={styles.row}>
        {/* `Label("Focus next", systemImage: "sparkles").font(.subheadline.bold())` in nexdoIndigo. */}
        <TaskSymbol color={theme.colors.link} name="sparkles" size={15} />
        <Text style={[styles.subheadlineBold, styles.grow, { color: theme.colors.link }]}>Focus next</Text>
        <Pressable
          accessibilityLabel="Focus options"
          accessibilityRole="button"
          accessibilityState={{ expanded: menuOpen }}
          onPress={() => setMenuOpen((open) => !open)}
          style={styles.menuButton}
          testID="today-focus-options"
        >
          <TaskSymbol color={theme.colors.link} name="ellipsis" size={17} />
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={[styles.menu, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.16) }]}>
          <Pressable accessibilityRole="button" onPress={() => choose(onOtherOptions)} style={styles.menuRow} testID="today-focus-menu-other">
            <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Other options</Text>
          </Pressable>
          <View style={[styles.menuDivider, { backgroundColor: theme.colors.separator }]} />
          <Pressable accessibilityRole="button" onPress={() => choose(onDismiss)} style={styles.menuRow} testID="today-focus-menu-dismiss">
            <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Dismiss suggestion</Text>
          </Pressable>
        </View>
      ) : null}

      {best ? (
        <>
          <Text numberOfLines={2} style={[styles.headline, { color: theme.colors.ink }]} testID="today-focus-title">
            {best.title}
          </Text>
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]} testID="today-focus-detail">
            {focusNextDetail(best.focusMinutes, canStart)}
          </Text>
          {/* `ViewThatFits`: the HStack fits at the default text size, so that is the branch ported. */}
          <View style={styles.row}>
            <Pressable
              accessibilityLabel="Start focus"
              accessibilityRole="button"
              accessibilityState={{ disabled: startDisabled }}
              disabled={startDisabled}
              onPress={onStart}
              style={[styles.capsule, { backgroundColor: theme.colors.tint, opacity: startDisabled ? 0.45 : 1 }]}
              testID="today-focus-start"
            >
              <TaskSymbol color="#FFFFFF" name="play.fill" size={13} />
              <Text style={[styles.subheadlineBold, { color: '#FFFFFF' }]}>Start focus</Text>
            </Pressable>
            <View style={styles.grow} />
            <Pressable accessibilityRole="button" onPress={onOtherOptions} style={styles.plain} testID="today-focus-other">
              <Text style={[theme.typography.body, { color: theme.colors.link }]}>Other options</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>Find a task for the time you have.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOtherOptions}
            style={[styles.capsule, styles.findButton, { backgroundColor: theme.colors.tint }]}
            testID="today-focus-find"
          >
            <Text style={[theme.typography.body, { color: '#FFFFFF' }]}>Find my next task</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** `"\(best.focusMinutes) min\(recommendation.canStart ? " · Fits your free time" : "")"` (`:1123`). */
export function focusNextDetail(focusMinutes: number, canStart: boolean): string {
  return `${focusMinutes} min${canStart ? ' · Fits your free time' : ''}`;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  subheadlineBold: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },

  // `.padding(18)` with corner radius 20.
  card: { gap: 10, padding: 18, borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prominent: { minHeight: 44, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plain: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  // `.padding(.horizontal, 18).padding(.bottom, 16).padding(.top, 4)`, radius 20, indigo 12% stroke.
  focusCard: { gap: 10, paddingHorizontal: 18, paddingBottom: 16, paddingTop: 4, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menu: { borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  menuRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  menuDivider: { height: StyleSheet.hairlineWidth },
  // `.buttonStyle(.borderedProminent)` on iOS 26 is a capsule.
  capsule: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 999 },
  findButton: { alignSelf: 'flex-start' },
});
