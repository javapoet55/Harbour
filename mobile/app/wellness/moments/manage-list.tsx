import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { withAlpha } from '../../../src/components/SignInBackdrop';
import { Text } from '../../../src/components/Text';
import { NEXDO_GRADIENT, TodayBackdrop } from '../../../src/components/TodayShell';
import { caption, headline, IconLabel, MomentCard, MomentIconTile } from '../../../src/features/moments/components';
import {
  MANAGEMENT_FILTERS,
  managementDateLabels,
  managementFilterIncludes,
  managementGroups,
  supportsGreetingCard,
  typeLabel,
  type ManagementFilter,
} from '../../../src/features/moments/domain';
import { useMomentList } from '../../../src/features/moments/store';
import { brand, textStyles, useTheme } from '../../../src/theme';

/**
 * `MomentsManagementEntry` (ios/App/ManageFestivalView.swift:4-88): the Scheduled / Need Review / Ready
 * to Schedule tabs (Phase 12, `MomentManagementFilter`), Scheduled first, each counting its groups.
 * Every non-archived group, one row each, LATEST date first; a group with recipients at different
 * stages shows under each of its tabs. A greeting-card occasion opens Manage Moment; a Custom one
 * opens the editor. Manage Moment's "Done" returns to Important Moments.
 */
export default function ManageMomentsScreen() {
  const theme = useTheme();
  const moments = useMomentList();
  const [filter, setFilter] = useState<ManagementFilter>('Scheduled');
  const groups = useMemo(() => managementGroups(moments), [moments]);
  const filtered = groups.filter((group) => managementFilterIncludes(filter, group));
  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView contentContainerStyle={styles.content} testID="manage-list">
        {/* The tabs (:28-42): the selected one takes the brand gradient, the others 8% indigo. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} testID="manage-filters">
          {MANAGEMENT_FILTERS.map((tab) => {
            const active = filter === tab;
            const count = groups.filter((group) => managementFilterIncludes(tab, group)).length;
            return (
              <Pressable
                key={tab}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(tab)}
                style={[styles.tab, !active && { backgroundColor: theme.scheme === 'dark' ? withAlpha(theme.colors.link, 0.16) : withAlpha(brand.nexdoIndigo, 0.08) }]}
                testID={`manage-filter-${tab}`}
              >
                {active ? <LinearGradient colors={[...NEXDO_GRADIENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} /> : null}
                <Text style={[styles.tabLabel, { color: active ? '#FFFFFF' : theme.colors.link }]}>{`${tab} (${count})`}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {groups.length === 0 ? (
          <View style={styles.empty} testID="manage-list-empty">
            <Ionicons name="gift-outline" size={44} color={theme.colors.secondaryLabel} />
            <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>No moments yet</Text>
            <Text style={[textStyles.subheadline, styles.center, { color: theme.colors.secondaryLabel }]}>
              Add a birthday, anniversary, festival, Get Well Soon, or custom moment to manage it here.
            </Text>
          </View>
        ) : null}
        {groups.length > 0 && filtered.length === 0 ? (
          <View style={styles.empty} testID="manage-filter-empty">
            <Ionicons name="calendar-outline" size={44} color={theme.colors.secondaryLabel} />
            <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>{`No moments in ${filter}`}</Text>
            <Text style={[textStyles.subheadline, styles.center, { color: theme.colors.secondaryLabel }]}>Choose another tab to manage your moments.</Text>
          </View>
        ) : null}
        {filtered.map((group) => {
          const moment = group.moments[0];
          if (!moment) return null;
          return (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              onPress={() =>
                supportsGreetingCard(moment)
                  ? router.push({ pathname: '/wellness/moments/manage', params: { ids: group.moments.map((item) => item.id).join(',') } })
                  : router.push({ pathname: '/wellness/moments/editor', params: { id: moment.id, done: 'back' } })
              }
              testID={`manage-moment-${moment.id}`}
            >
              <MomentCard>
                <View style={styles.row}>
                  <MomentIconTile type={moment.type} title={moment.title} />
                  <View style={styles.text}>
                    <Text style={[headline, { color: theme.colors.label }]}>{moment.title}</Text>
                    <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>{typeLabel(moment.type)}</Text>
                    {managementDateLabels(group).map((label) => (
                      <IconLabel key={label} icon="calendar-outline" title={label} color={theme.colors.link} style={textStyles.subheadline} size={15} />
                    ))}
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
  // `HStack(spacing: 8)`; each tab `.padding(.horizontal, 16).padding(.vertical, 12)` in a capsule.
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, overflow: 'hidden', justifyContent: 'center' },
  tabLabel: { ...textStyles.subheadline, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 6 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 26 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
});
