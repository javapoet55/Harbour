import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../../src/components/Text';
import { calendarKey } from '../../src/lib/calendarDates';
import { useMe } from '../../src/query/useMe';
import { useScheduleIntelligence } from '../../src/query/useToday';
import { useTheme } from '../../src/theme';

/**
 * `conflictSheet` (ios/App/CalendarView.swift:463), **body `:464-477`**, with its child
 * `intelligenceStatus(allowCreation:)` (`:295-312`).
 *
 * Screen 28. Phase 5 pointed the Calendar's "Review conflicts" button at `/today/attention`, which is
 * a port of a DIFFERENT Swift view (`attentionDetails`, RootView.swift:1202). The two show the same
 * attention items but this one has its own title, its own empty state, and the intelligence status
 * block — so Phase 10 built it properly and re-pointed the button.
 */
export default function CalendarConflicts() {
  const theme = useTheme();
  const intelligence = useScheduleIntelligence();
  const { data: profile } = useMe();

  // `Date()` is read once per mount, so the section cannot appear and vanish mid-render.
  const [now] = useState(() => Date.now());

  const zone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = intelligence.data?.today ?? null;
  // `if let info = model.scheduleIntelligence?.today, info.day == dates.key(Date())` (`:466`).
  const current = today !== null && today.day === calendarKey(now, zone);

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      {/* `.navigationTitle("Schedule review")` with a Done button (`:476`). */}
      <View style={styles.navBar}>
        <Text accessibilityRole="header" style={[styles.navTitle, styles.grow, { color: theme.colors.ink }]}>
          Schedule review
        </Text>
        <Pressable accessibilityLabel="Done" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} testID="conflicts-done">
          <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {current && today ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.secondary }]}>TODAY’S SCHEDULE REVIEW</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
              {today.attention.length === 0 ? (
                <Text style={[theme.typography.body, styles.row, { color: theme.colors.ink }]} testID="conflicts-empty">
                  No issues reported by schedule intelligence.
                </Text>
              ) : (
                today.attention.map((item, index) => (
                  <View key={item.id} style={[styles.item, index > 0 ? { borderTopColor: theme.colors.separator, borderTopWidth: StyleSheet.hairlineWidth } : null]} testID={`conflict-${item.id}`}>
                    <Text style={[styles.caption, { color: theme.colors.secondary }]}>{item.label}</Text>
                    <Text style={[styles.headline, { color: theme.colors.ink }]}>{item.title}</Text>
                    <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{item.explanation}</Text>
                    <Text style={[styles.subheadline, { color: theme.colors.ink }]}>{item.recommendedAction}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : null}

        {/* `Section { intelligenceStatus() }` (`:474`). */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
          <IntelligenceStatus
            error={intelligence.isError ? (intelligence.error as Error | null) : null}
            hasPrevious={intelligence.data !== undefined}
            loading={intelligence.isFetching}
            onRetry={() => void intelligence.refetch()}
            stale={!current}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** `intelligenceStatus(allowCreation:)` (CalendarView.swift:295-312), with `allowCreation` false. */
function IntelligenceStatus({
  loading,
  error,
  hasPrevious,
  stale,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  /** `model.scheduleIntelligence != nil` — a previous successful review is still on screen. */
  hasPrevious: boolean;
  /** `model.scheduleIntelligence?.today.day != dates.key(Date())`. */
  stale: boolean;
  onRetry: () => void;
}) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={styles.row} testID="conflicts-loading">
        <ActivityIndicator color={theme.colors.tint} size="small" />
        <Text style={[styles.subheadline, { color: theme.colors.ink }]}>Reviewing your schedule…</Text>
      </View>
    );
  }

  if (error !== null) {
    return (
      <View style={styles.statusBlock} testID="conflicts-error">
        <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{error.message}</Text>
        {hasPrevious ? (
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Showing the last successful review.</Text>
        ) : null}
        <Pressable accessibilityLabel="Retry schedule intelligence" accessibilityRole="button" onPress={onRetry} style={styles.action} testID="conflicts-retry">
          <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.tint }]}>Retry schedule intelligence</Text>
        </Pressable>
      </View>
    );
  }

  if (stale) {
    return (
      <Pressable accessibilityLabel="Review schedule" accessibilityRole="button" onPress={onRetry} style={styles.action} testID="conflicts-review">
        <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.tint }]}>Review schedule</Text>
      </Pressable>
    );
  }

  // Swift renders nothing in the fourth case: today's review is present and current.
  return null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },

  navBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 14 },
  navTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },

  scroll: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', paddingHorizontal: 4 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  // `.padding(.vertical, 6)` on each row, with the list's own separators.
  item: { gap: 8, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  statusBlock: { gap: 6, paddingVertical: 14 },
  action: { minHeight: 44, justifyContent: 'center' },
});
