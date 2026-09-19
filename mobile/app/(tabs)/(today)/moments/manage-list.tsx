import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../../../src/components/Text';
import { TodayBackdrop } from '../../../../src/components/TodayShell';
import { caption, headline, MomentCard, MomentIconTile } from '../../../../src/features/moments/components';
import { displayGroups, isArchived, supportsGreetingCard, typeLabel } from '../../../../src/features/moments/domain';
import { useMomentList } from '../../../../src/features/moments/store';
import { textStyles, useTheme } from '../../../../src/theme';

/**
 * `MomentsManagementEntry` (ios/App/ManageFestivalView.swift:3-44): every non-archived moment, one row
 * per group, soonest first. A greeting-card occasion opens Manage Moment; a Custom one opens the editor.
 * Manage Moment's "Done" returns to Important Moments (`onDone: managingMoments = false`).
 */
export default function ManageMomentsScreen() {
  const theme = useTheme();
  const moments = useMomentList();
  const groups = displayGroups(
    moments.filter((moment) => !isArchived(moment)).sort((a, b) => (a.nextOccurrence < b.nextOccurrence ? -1 : a.nextOccurrence > b.nextOccurrence ? 1 : 0)),
  );
  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView contentContainerStyle={styles.content} testID="manage-list">
        {groups.length === 0 ? (
          <View style={styles.empty} testID="manage-list-empty">
            <Ionicons name="gift-outline" size={44} color={theme.colors.secondaryLabel} />
            <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>No moments yet</Text>
            <Text style={[textStyles.subheadline, styles.center, { color: theme.colors.secondaryLabel }]}>
              Add a birthday, anniversary, festival, Get Well Soon, or custom moment to manage it here.
            </Text>
          </View>
        ) : null}
        {groups.map((group) => {
          const moment = group.moments[0];
          if (!moment) return null;
          return (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              onPress={() =>
                supportsGreetingCard(moment)
                  ? router.push({ pathname: '/moments/manage', params: { ids: group.moments.map((item) => item.id).join(',') } })
                  : router.push({ pathname: '/moments/editor', params: { id: moment.id, done: 'back' } })
              }
              testID={`manage-moment-${moment.id}`}
            >
              <MomentCard>
                <View style={styles.row}>
                  <MomentIconTile type={moment.type} title={moment.title} />
                  <View style={styles.text}>
                    <Text style={[headline, { color: theme.colors.label }]}>{moment.title}</Text>
                    <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>{typeLabel(moment.type)}</Text>
                    {!moment.enabled ? <Text style={[caption, { color: theme.colors.secondaryLabel }]}>Inactive</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={theme.colors.label} />
                </View>
              </MomentCard>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 6 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
});
