import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import type { VoiceUsage } from '../../api/types';
import { ProfileCard } from '../../components/ProfileParts';
import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { brand, linearGradientStops, useTheme } from '../../theme';
import { voiceUsageProgress } from '../../voice/usageMeter';

/**
 * `AccountView.voiceUsageCard` (ios/App/ProfileView.swift:101-132), placed under the name and email
 * (`:77`). Before `/api/voice/usage` answers — or when it never does — the card shows Swift's defaults
 * (`:102-106`): "0 min", an empty bar, "0 min used", "100 min remaining", "This month · updated today".
 */

/** `NexdoTheme.gradient`: magenta → indigo → blue, leading to trailing. */
const GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

/**
 * The default `ProgressView` track, measured off `account-voice-usage` (228, 228, 229) and
 * `account-voice-usage-dark` (71, 71, 75).
 */
const TRACK = { light: '#E4E4E5', dark: '#47474B' } as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `voiceMinutes(_:)` (ProfileView.swift:134-139). */
export function voiceMinutes(seconds: number): string {
  if (seconds === 0) return '0 min';
  if (seconds < 60) return '<1 min';
  const minutes = seconds / 60;
  return minutes < 10 ? `${minutes.toFixed(1)} min` : `${Math.round(minutes)} min`;
}

/**
 * `monthLabel(_:)` (ProfileView.swift:141-144): `yyyy-MM` (formatter `:175`) as the wide month name.
 *
 * Swift parses the month at UTC midnight and then formats it in the DEVICE zone, which would name
 * the previous month west of UTC. The captures show the month the server sent ("2026-09" →
 * "September"), so the month is read straight from the string.
 */
export function voiceMonthLabel(month: string | null | undefined): string {
  const match = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
  const index = match ? Number(match[2]) - 1 : -1;
  if (index < 0 || index > 11) return 'This month · updated today';
  return `${MONTHS[index]} · updated today`;
}

/** `waveform.circle.fill` in white on the 44 pt gradient circle: the waveform is cut out of the disc. */
function WaveformBadge() {
  return (
    <LinearGradient colors={GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.badge}>
      <View style={styles.disc}>
        {[3, 6, 8, 10, 8, 6, 3].map((height, index) => (
          <View key={index} style={[styles.bar, { height, backgroundColor: brand.nexdoIndigo }]} />
        ))}
      </View>
    </LinearGradient>
  );
}

export function VoiceUsageCard({ usage }: { usage: VoiceUsage | undefined }) {
  const theme = useTheme();
  const used = usage?.usedSeconds ?? 0;
  const limit = usage?.limitMinutes ?? 100;
  const remaining = usage?.remainingSeconds ?? limit * 60;
  const progress = usage ? voiceUsageProgress(usage) : 0;

  return (
    <ProfileCard style={styles.card} testID="account-voice-usage">
      <View style={styles.top}>
        <WaveformBadge />
        <View style={styles.titles}>
          <Text style={[styles.headline, { color: theme.colors.ink }]}>Real-time Voice</Text>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Monthly usage</Text>
        </View>
        <Text style={[styles.total, { color: theme.colors.link }]} testID="voice-usage-total">
          {voiceMinutes(used)}
        </Text>
      </View>

      {/* `ProgressView(value:).tint(.nexdoBlue).scaleEffect(x: 1, y: 1.8)`: the 4 pt bar drawn 7.2 pt. */}
      <View
        accessibilityLabel="Real-time voice usage"
        accessibilityRole="progressbar"
        accessibilityValue={{ text: `${voiceMinutes(used)} used out of ${limit} minutes this month` }}
        accessible
        style={[styles.track, { backgroundColor: theme.scheme === 'dark' ? TRACK.dark : TRACK.light }]}
        testID="voice-usage-bar"
      >
        <View style={[styles.fill, { flex: progress, backgroundColor: brand.nexdoBlue }]} testID="voice-usage-fill" />
        <View style={{ flex: 1 - progress }} />
      </View>

      <View style={styles.row}>
        <Text style={[styles.captionMedium, { color: theme.colors.secondary }]}>{`${voiceMinutes(used)} used`}</Text>
        <Text style={[styles.captionMedium, { color: theme.colors.secondary }]}>{`${voiceMinutes(remaining)} remaining`}</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.label}>
          <TaskSymbol color={theme.colors.secondary} name="calendar" size={11} />
          <Text style={[styles.caption2, { color: theme.colors.secondary }]}>{voiceMonthLabel(usage?.month)}</Text>
        </View>
        <Text style={[styles.caption2, { color: theme.colors.secondary }]}>{`${limit} min / month`}</Text>
      </View>
    </ProfileCard>
  );
}

const styles = StyleSheet.create({
  // `VStack(alignment: .leading, spacing: 14).padding(16)`
  card: { padding: 16, gap: 14 },
  // `HStack(alignment: .top, spacing: 12)`
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titles: { flex: 1, gap: 3 },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 21, height: 21, borderRadius: 10.5, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1.4 },
  bar: { width: 1.2, borderRadius: 0.6 },
  // `.headline`, `.caption`, `.caption.weight(.medium)`, `.caption2`, `.title3.bold()` + `.monospacedDigit()`
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  captionMedium: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] },
  caption2: { fontSize: 11, lineHeight: 13 },
  total: { fontSize: 20, lineHeight: 25, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 7.2, borderRadius: 3.6, overflow: 'hidden', flexDirection: 'row' },
  fill: { borderRadius: 3.6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `Label(_:systemImage: "calendar")`
  label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
