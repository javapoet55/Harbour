import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { ImportantMoment, WishDeliveryPlan } from '../../../../src/api/moments';
import { Text } from '../../../../src/components/Text';
import { TodayBackdrop } from '../../../../src/components/TodayShell';
import { GlassCapsule, GlassCircle } from '../../../../src/components/PushedHeader';
import {
  caption,
  headline,
  MomentCard,
  MomentIconTile,
  MomentSegments,
  MomentStatusBadge,
  systemColors,
  title1,
} from '../../../../src/features/moments/components';
import { momentDate, momentLabel, momentRelative, sendDayLabel, shortTime, UPCOMING_GROUPS } from '../../../../src/features/moments/dates';
import {
  capitalized,
  DELIVERY_FILTERS,
  displayedMoments,
  displayGroups,
  momentForPlan,
  needsWishReview,
  planDate,
  planStatusLabel,
  readyToSchedule,
  sortedPlans,
  supportsGreetingCard,
  tabPlans,
  TYPE_FILTERS,
  typeLabel,
  upcomingDelivery,
  upcomingGroup,
  latestDraft,
  type MomentDisplayGroup,
  type MomentsTab,
} from '../../../../src/features/moments/domain';
import { MenuPicker } from '../../../../src/features/moments/form';
import { momentsStore, useMomentList, useMoments } from '../../../../src/features/moments/store';
import { routedDestination } from '../../../../src/features/moments/useMomentsLifecycle';
import { brand, linearGradientStops, textStyles, useTheme } from '../../../../src/theme';

const GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

function manageHref(group: MomentDisplayGroup) {
  return { pathname: '/moments/manage' as const, params: { ids: group.moments.map((moment) => moment.id).join(',') } };
}

/**
 * `ImportantMomentsView` (ios/App/ImportantMomentsView.swift:208-307): Upcoming / Scheduled / Sent,
 * search and the type filter, the summary card with Manage and Create New, the weekly buckets, and the
 * wish cards on the other two tabs.
 *
 * `routed` is `MomentRoutedView` (`:574-594`): a notification opened this screen, so it carries a
 * leading Close and pushes the moment's detail once.
 */
export default function ImportantMomentsScreen() {
  const theme = useTheme();
  const { routed } = useLocalSearchParams<{ routed?: string }>();
  const moments = useMomentList();
  const error = useMoments((state) => state.error);
  const loading = useMoments((state) => state.loading);
  const lastSynced = useMoments((state) => state.lastSynced);
  const [tab, setTab] = useState<MomentsTab>('Upcoming');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('All');
  const [deliveryFilter, setDeliveryFilter] = useState<string>('All');
  const [now] = useState(() => Date.now());

  // `.task { await store.prepareDefaultReminders(); await store.refresh() }`
  useEffect(() => {
    void (async () => {
      await momentsStore.getState().prepareDefaultReminders();
      await momentsStore.getState().refresh();
    })();
  }, []);

  const routedOnce = useRef(false);
  useEffect(() => {
    if (!routed || routedOnce.current) return;
    const moment = moments.find((item) => item.id === routed);
    if (!moment) return;
    routedOnce.current = true;
    router.push(routedDestination(moment, moments) as never);
  }, [moments, routed]);

  const displayed = useMemo(() => displayedMoments(moments, { tab, filter, search }, now), [moments, tab, filter, search, now]);
  const plans = useMemo(() => tabPlans(sortedPlans(moments), displayed, { tab, deliveryFilter }), [moments, displayed, tab, deliveryFilter]);

  const enabled = displayed.filter((moment) => moment.enabled);
  const upcomingCount = displayGroups(enabled).length;
  const scheduled = displayed.filter((moment) => moment.enabled && upcomingDelivery(moment) !== undefined).length;
  const review = displayed.filter(needsWishReview).length;
  const ready = displayed.filter(readyToSchedule).length;

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          // Only when routed from a notification; an explicit `undefined` would erase the glass back
          // button the Today stack gives every push.
          ...(routed
            ? {
                headerLeft: () => (
                  <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8} testID="moments-close">
                    <GlassCapsule>
                      <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.tint }}>Close</Text>
                    </GlassCapsule>
                  </Pressable>
                ),
              }
            : {}),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Important Moments settings" onPress={() => router.push('/moments/settings')} hitSlop={6} testID="moments-settings">
              <GlassCircle>
                <Ionicons name="settings-outline" size={22} color={theme.colors.tint} />
              </GlassCircle>
            </Pressable>
          ),
        }}
      />
      <TodayBackdrop />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void momentsStore.getState().refresh()} />}
        testID="moments-scroll"
      >
        <MomentSegments options={['Upcoming', 'Scheduled', 'Sent'] as const} value={tab} onChange={setTab} testIDPrefix="moments-tab" />
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Search moments"
            onChangeText={setSearch}
            placeholder="Search moments"
            placeholderTextColor={theme.colors.placeholder}
            style={[styles.search, { color: theme.colors.label, backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}
            testID="moments-search"
            value={search}
          />
          <MenuPicker
            accessibilityLabel="Filter moment type"
            hideLabel
            label="Type"
            onChange={setFilter}
            options={TYPE_FILTERS.map((value) => ({ value, title: value }))}
            testID="moments-type-filter"
            value={filter}
          />
        </View>

        {tab === 'Upcoming' ? (
          <>
            <MomentCard testID="moments-summary">
              <View style={styles.summaryRow}>
                <MomentIconTile type="summary" />
                <View style={styles.summaryText}>
                  <Text style={[styles.title3, { color: theme.colors.label }]}>{`${upcomingCount} upcoming moment${upcomingCount === 1 ? '' : 's'}`}</Text>
                  <Text style={[styles.subheadline, { color: theme.colors.secondaryLabel }]}>{`${scheduled} wish${scheduled === 1 ? '' : 'es'} scheduled`}</Text>
                  <Text style={[styles.subheadline, { color: theme.colors.secondaryLabel }]}>{`${review} wish${review === 1 ? ' needs' : 'es need'} review`}</Text>
                  {ready > 0 ? <Text style={[styles.subheadline, { color: theme.colors.secondaryLabel }]}>{`${ready} ready to schedule`}</Text> : null}
                  <View style={styles.summaryActions}>
                    <Pressable accessibilityRole="button" onPress={() => router.push('/moments/manage-list')} style={styles.summaryAction} testID="moments-manage">
                      <Text numberOfLines={1} style={styles.summaryActionLabel}>
                        Manage
                      </Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/moments/editor', params: { done: 'list' } })} style={styles.summaryAction} testID="moments-create-new">
                      <Text numberOfLines={1} style={styles.summaryActionLabel}>
                        Create New
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </MomentCard>
            {UPCOMING_GROUPS.map((group) => {
              const items = displayed.filter((moment) => upcomingGroup(moment, now) === group);
              if (items.length === 0) return null;
              return (
                <View key={group} style={styles.bucket}>
                  <Text style={[title1, styles.bold, styles.bucketTitle, { color: theme.colors.label }]}>{group}</Text>
                  {displayGroups(items).map((entry) => {
                    const first = entry.moments[0];
                    if (!first) return null;
                    return supportsGreetingCard(first) ? (
                      <FestivalGroupCard key={entry.id} group={entry} onManage={() => router.push(manageHref(entry))} now={now} />
                    ) : (
                      <UpcomingMomentRow key={entry.id} moment={first} now={now} />
                    );
                  })}
                </View>
              );
            })}
          </>
        ) : (
          <>
            {tab === 'Scheduled' ? (
              // A menu `Picker` in SwiftUI's default centred `VStack`.
              <View style={styles.centredRow}>
                <MenuPicker
                  hideLabel
                  label="Delivery"
                  onChange={setDeliveryFilter}
                  options={DELIVERY_FILTERS.map((value) => ({ value, title: value }))}
                  testID="moments-delivery-filter"
                  value={deliveryFilter}
                />
              </View>
            ) : null}
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} moment={momentForPlan(displayed, plan)} />
            ))}
          </>
        )}

        {displayed.length === 0 ? (
          <View style={styles.empty} testID="moments-empty">
            <Ionicons name="gift-outline" size={44} color={theme.colors.secondaryLabel} />
            <Text style={[textStyles.title2, styles.bold, { color: theme.colors.label }]}>No moments yet</Text>
            <Text style={[textStyles.subheadline, styles.center, { color: theme.colors.secondaryLabel }]}>Add a moment manually, or select contacts and calendars in Settings.</Text>
          </View>
        ) : null}
        {error ? (
          <>
            <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="moments-error">
              {error}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void momentsStore.getState().refresh()} testID="moments-retry">
              <Text style={[textStyles.body, { color: theme.colors.tint }]}>Retry</Text>
            </Pressable>
          </>
        ) : null}
        {loading ? <ActivityIndicator /> : null}
        {lastSynced !== null ? <Text style={[caption, { color: theme.colors.secondaryLabel }]}>{`Updated ${shortTime(lastSynced)}`}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Moment"
          onPress={() => router.push({ pathname: '/moments/editor', params: { done: 'list' } })}
          style={[styles.addButton, { backgroundColor: theme.colors.tint }]}
          testID="moments-add"
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={[headline, { color: '#FFFFFF' }]}>Add Moment</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** `UpcomingMomentRow` (ImportantMomentsView.swift:86-120): Custom moments on the Upcoming tab. */
function UpcomingMomentRow({ moment, now }: { moment: ImportantMoment; now: number }) {
  const theme = useTheme();
  const plan = upcomingDelivery(moment);
  const isReady = readyToSchedule(moment);
  const latest = latestDraft(moment);
  return (
    <MomentCard testID={`moment-row-${moment.id}`}>
      <View style={styles.rowTop}>
        <MomentIconTile type={moment.type} title={moment.title} />
        <View style={styles.rowText}>
          <Text style={[styles.title3, { color: theme.colors.label }]}>{moment.title}</Text>
          <Text style={[styles.subheadline, { color: theme.colors.secondaryLabel }]}>{`${typeLabel(moment.type)} · ${momentRelative(moment.nextOccurrence, moment.timeZoneID, now)}`}</Text>
          {!moment.enabled ? (
            <MomentStatusBadge title="Disabled" color={theme.colors.secondaryLabel} icon="pause-circle-outline" />
          ) : plan ? (
            <>
              <MomentStatusBadge
                title={plan.automaticDelivery ? 'Auto-send scheduled' : 'Reminder scheduled'}
                color={plan.automaticDelivery ? systemColors.green : systemColors.blue}
                icon={plan.automaticDelivery ? 'checkmark-circle' : 'time-outline'}
              />
              <Text style={[caption, { color: theme.colors.secondaryLabel }]}>{`${capitalized(plan.channel)} · ${momentLabel(planDate(plan), plan.timeZoneID)}`}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Manage" onPress={() => router.push({ pathname: '/moments/wish', params: { planId: plan.id } })} style={styles.link} testID={`moment-manage-${moment.id}`}>
                <Ionicons name="chevron-forward" size={17} color={theme.colors.tint} />
                <Text style={[textStyles.body, { color: theme.colors.tint }]}>Manage</Text>
              </Pressable>
            </>
          ) : (
            <>
              <MomentStatusBadge
                title={isReady ? 'Ready to schedule' : 'Needs review'}
                color={isReady ? systemColors.blue : systemColors.orange}
                icon={isReady ? 'time-outline' : 'alert-circle'}
              />
              <Text style={[caption, { color: theme.colors.secondaryLabel }]}>
                {isReady ? 'Message approved · choose delivery' : latest === undefined ? 'Create a personal wish' : 'Message draft ready'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={latest === undefined ? 'Create wish' : 'Review wish'}
                onPress={() => router.push({ pathname: '/moments/review', params: { id: moment.id } })}
                style={styles.reviewButtonWrap}
                testID={`moment-review-${moment.id}`}
              >
                <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.reviewButton}>
                  <Text style={[styles.subheadline, styles.bold, { color: '#FFFFFF' }]}>Review</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/moments/editor', params: { id: moment.id, done: 'back' } })} style={styles.link} testID={`moment-edit-${moment.id}`}>
            <Text style={[styles.subheadline, { color: theme.colors.tint }]}>Edit</Text>
          </Pressable>
        </View>
      </View>
    </MomentCard>
  );
}

/** `FestivalGroupCard` (ImportantMomentsView.swift:121-165): every greeting-card occasion, one card per group. */
function FestivalGroupCard({ group, onManage, now }: { group: MomentDisplayGroup; onManage: () => void; now: number }) {
  const theme = useTheme();
  const moment = group.moments[0];
  const scheduledCount = group.moments.filter((item) => item.enabled && upcomingDelivery(item) !== undefined).length;
  const reviewCount = group.moments.filter(needsWishReview).length;
  const readyCount = group.moments.filter(readyToSchedule).length;
  const active = group.moments.filter((item) => item.enabled).length;
  return (
    <Pressable accessibilityActions={[{ name: 'activate', label: 'Manage moment' }]} onAccessibilityAction={onManage} onPress={onManage} testID={`festival-card-${moment.id}`}>
      <MomentCard>
        <View style={styles.rowTop}>
          <MomentIconTile type={moment.type} title={moment.title} />
          <View style={styles.rowText}>
            <View style={styles.titleRow}>
              <Text style={[styles.title3, styles.grow, { color: theme.colors.label }]}>{moment.title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${moment.title}`} onPress={onManage} style={styles.gear} testID={`festival-manage-${moment.id}`}>
                <Ionicons name="settings-outline" size={20} color={brand.nexdoIndigo} />
              </Pressable>
            </View>
            <Text style={[styles.subheadline, { color: theme.colors.secondaryLabel }]}>{`${typeLabel(moment.type)} · ${momentRelative(moment.nextOccurrence, moment.timeZoneID, now)}`}</Text>
            <Text style={[styles.subheadline, { color: theme.colors.secondaryLabel }]} testID={`festival-date-${moment.id}`}>
              {sendDayLabel(momentDate(moment.nextOccurrence, moment.timeZoneID, now), moment.timeZoneID)}
            </Text>
            {reviewCount > 0 ? (
              <MomentStatusBadge
                title={reviewCount === active ? 'Needs review' : `${reviewCount} wish${reviewCount === 1 ? ' needs' : 'es need'} review`}
                color={systemColors.orange}
                icon="alert-circle"
              />
            ) : null}
            {readyCount > 0 ? <MomentStatusBadge title={readyCount === active ? 'Ready to schedule' : `${readyCount} ready to schedule`} color={systemColors.blue} icon="time-outline" /> : null}
            {scheduledCount > 0 ? <MomentStatusBadge title={`${scheduledCount} scheduled`} color={systemColors.blue} icon="time-outline" /> : null}
          </View>
        </View>
      </MomentCard>
    </Pressable>
  );
}

/** A wish on the Scheduled or Sent tab (ImportantMomentsView.swift:274-287). */
function PlanCard({ plan, moment }: { plan: WishDeliveryPlan; moment: ImportantMoment | undefined }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/moments/wish', params: { planId: plan.id } })} testID={`plan-card-${plan.id}`}>
      <MomentCard>
        <View style={styles.rowTop}>
          <MomentIconTile type={moment?.type ?? 'custom'} title={moment?.title ?? plan.subject} />
          <View style={styles.rowText}>
            <Text style={[headline, { color: theme.colors.label }]}>{plan.subject}</Text>
            <Text style={[textStyles.body, { color: brand.nexdoIndigo }]}>{planStatusLabel(plan)}</Text>
            <Text numberOfLines={2} style={[textStyles.body, { color: theme.colors.label }]}>
              {plan.body}
            </Text>
            <Text style={[caption, { color: theme.colors.label }]}>{`${capitalized(plan.channel)} · ${momentLabel(planDate(plan), plan.timeZoneID)}`}</Text>
          </View>
        </View>
      </MomentCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5, fontSize: 17 },
  summaryRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  summaryText: { flex: 1, gap: 6 },
  summaryActions: { flexDirection: 'row', gap: 20 },
  summaryAction: { minHeight: 44, justifyContent: 'center' },
  summaryActionLabel: { fontSize: 18, lineHeight: 22, fontWeight: '600', color: brand.nexdoIndigo },
  title3: { ...textStyles.title3, fontWeight: '700' },
  subheadline: { ...textStyles.subheadline },
  bold: { fontWeight: '700' },
  bucket: { gap: 16 },
  bucketTitle: { marginTop: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  rowText: { flex: 1, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  grow: { flex: 1 },
  gear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  reviewButtonWrap: { alignSelf: 'flex-start' },
  reviewButton: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
  // `ContentUnavailableView` insets its text further than the list: 295pt wide on a 402pt screen.
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 35 },
  centredRow: { alignItems: 'center' },
  center: { textAlign: 'center' },
  addButton: { minHeight: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
