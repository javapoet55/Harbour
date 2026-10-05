import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { GroceryItem, GroceryList, ShoppingOfferMatch, StoreOffer } from '../../api/shopping';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { useChooseOffer, useShoppingOffers } from '../../query/useShoppingOffers';
import { brand, linearGradientStops, textStyles, useTheme } from '../../theme';
import { headline, systemColors } from '../moments/components';
import { MenuPicker } from '../moments/form';
import { ListSettingsSheet } from './ListSettings';
import { listInput } from './model';
import { ALL_STORES, chosenPanels, initialTab, OFFER_TABS, offerDate, offerEndDate, offersFor, storeChoices, visibleOffers } from './offers';
import { shoppingStore, useShopping } from './store';

/**
 * `ShoppingOffersView` and `ShoppingOfferDetail` (ios/App/ShoppingOffersView.swift:27-120): the store
 * offers for a list or one item, by Matching / Available / Alternatives and store, the chosen offers
 * with "Remove selection", how offers are labeled, and Manage stores; and one offer, with Choose this
 * offer / Remove selection. Matching is the server's.
 *
 * NOT COPIED: Swift's "Valid through" date, which reads a day late east of the store (§22 "For the
 * team"). It is the store's own last day here (`offerEndDate`).
 */

const SAVE_GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

/** The list as this screen last saw it: the store's copy, or a newer one this screen saved. */
function useCurrentList(id: string): [GroceryList | null, (list: GroceryList) => void] {
  const stored = useShopping((state) => state.lists.find((value) => value.id === id) ?? null);
  const [local, setLocal] = useState<GroceryList | null>(null);
  const list = local && (!stored || local.revision >= stored.revision) ? local : stored;
  return [list, setLocal];
}

/** `OfferPanel` (:121-124). */
function OfferPanel({ children, testID }: { children: ReactNode; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.colors.surface }]} testID={testID}>
      {children}
    </View>
  );
}

/** `OfferSummary` (:125-131): the picture, product, store and size, price, savings and unit price. */
function OfferSummary({ offer }: { offer: StoreOffer }) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.summary}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.picture}>
        {offer.imageURL && !failed ? (
          <Image onError={() => setFailed(true)} resizeMode="contain" source={{ uri: offer.imageURL }} style={styles.picture} />
        ) : (
          <Ionicons color={brand.nexdoBlue} name="basket-outline" size={34} />
        )}
      </View>
      <View style={[styles.grow, styles.summaryText]}>
        <Text style={[headline, { color: theme.colors.label }]}>{offer.product}</Text>
        <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>{`${offer.store} · ${offer.packageSize ?? 'Size not specified'}`}</Text>
        {offer.price ? (
          <Text style={[styles.price, { color: theme.colors.label }]}>{offer.price}</Text>
        ) : (
          <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>Price not published</Text>
        )}
        {offer.savings ? <Text style={[headline, styles.savings, { color: systemColors.red, backgroundColor: withAlpha(systemColors.red, 0.08) }]}>{offer.savings}</Text> : null}
        {offer.unitPrice ? <Text style={[styles.caption, { color: theme.colors.label }]}>{offer.unitPrice}</Text> : null}
      </View>
    </View>
  );
}

export function OffersScreen({ listId, itemId }: { listId: string; itemId?: string | null }) {
  const theme = useTheme();
  const [list, setList] = useCurrentList(listId);
  const busy = useShopping((state) => state.busy);
  const offers = useShoppingOffers(listId);
  const choose = useChooseOffer();
  const [category, setCategory] = useState<string>('matching');
  const [storeFilter, setStoreFilter] = useState(ALL_STORES);
  const [settings, setSettings] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const snapshot = offers.data ?? null;
  const matches = offersFor(snapshot?.matches ?? [], itemId);
  // After each load (:86-87): "Open on a tab that has offers; most items have no brand, so their offers
  // are under Available."
  const [adjusted, setAdjusted] = useState<typeof snapshot>(null);
  if (snapshot && adjusted !== snapshot) {
    setAdjusted(snapshot);
    setCategory(initialTab(matches, category));
  }
  if (!list) return null;
  const visible = visibleOffers(matches, category, storeFilter);
  const error = failure ?? (offers.isError ? (offers.error as Error).message : null);
  const title = (itemId ? list.items.find((value) => value.id === itemId)?.name : null) ?? list.title;
  const reload = () => {
    setFailure(null);
    void offers.refetch();
  };

  /** `remove(_:)` (:91-94). */
  const remove = (item: GroceryItem) =>
    choose.mutate(
      { list, itemId: item.id, offerId: null },
      {
        onSuccess: (updated) => setList(updated),
        onError: (caught) => setFailure(caught.message),
      },
    );

  return (
    <View style={styles.fill}>
      {/* `.navigationTitle(itemId == nil ? "Offers for your list" : "Item offers")` (:79). */}
      <Stack.Screen options={{ title: itemId ? 'Item offers' : 'Offers for your list' }} />
      <TodayBackdrop />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={reload} refreshing={false} />}
        testID={itemId ? 'item-offers' : 'list-offers'}
      >
        <Text style={[textStyles.title3, { color: theme.colors.secondary }]}>{title}</Text>
        <ScrollView contentContainerStyle={styles.tabs} horizontal showsHorizontalScrollIndicator={false}>
          {OFFER_TABS.map((tab) => {
            const on = category === tab.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                key={tab.key}
                onPress={() => setCategory(tab.key)}
                style={[styles.tab, { backgroundColor: on ? brand.nexdoBlue : withAlpha(brand.nexdoIndigo, 0.08) }]}
                testID={`offers-tab-${tab.key}`}
              >
                <Text style={[textStyles.subheadline, styles.semibold, { color: on ? '#FFFFFF' : theme.colors.link }]}>{`${tab.title} (${matches.filter((match) => match.category === tab.key).length})`}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.storeRow}>
          <MenuPicker
            hideLabel
            label="Store"
            onChange={setStoreFilter}
            options={storeChoices(matches).map((store) => ({ value: store, title: store }))}
            testID="offers-store"
            value={storeFilter}
          />
        </View>
        {error ? (
          <>
            <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="offers-error">
              {error}
            </Text>
            <Pressable accessibilityRole="button" onPress={reload} testID="offers-retry">
              <Text style={[textStyles.body, { color: theme.colors.link }]}>Retry</Text>
            </Pressable>
          </>
        ) : null}
        {snapshot === null && error === null ? (
          <View style={styles.progress} testID="offers-loading">
            <ActivityIndicator />
            <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]}>Checking saved offers…</Text>
          </View>
        ) : null}
        {visible.map((match) => (
          <Pressable
            accessibilityRole="button"
            key={match.itemId + match.offer.id}
            onPress={() => router.push({ pathname: '/wellness/shopping/offer', params: { id: listId, itemId: match.itemId, offerId: match.offer.id } })}
            testID={`offer-${match.itemId}-${match.offer.id}`}
          >
            <OfferPanel>
              <OfferSummary offer={match.offer} />
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>{match.itemName}</Text>
              <Text style={[textStyles.subheadline, { color: brand.nexdoBlue }]}>{match.differences[0] ?? match.reasons.join(' · ')}</Text>
              {match.selected ? (
                <View style={styles.label}>
                  <Ionicons color={systemColors.green} name="checkmark-circle" size={17} />
                  <Text style={[textStyles.body, { color: systemColors.green }]}>Chosen for this item</Text>
                </View>
              ) : null}
            </OfferPanel>
          </Pressable>
        ))}
        {snapshot && visible.length === 0 ? (
          <OfferPanel testID="offers-empty">
            <View style={styles.label}>
              <Ionicons color={theme.colors.link} name="pricetag-outline" size={17} />
              <Text style={[textStyles.body, { color: theme.colors.label }]}>
                {matches.length === 0 ? `No offers for ${itemId ? 'this item' : 'this list'} yet` : `No ${OFFER_TABS.find((tab) => tab.key === category)!.title.toLowerCase()} offers`}
              </Text>
            </View>
            <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>
              {matches.length === 0 ? snapshot.status : 'Try another category, or check your store settings. New offers appear after the daily source check.'}
            </Text>
          </OfferPanel>
        ) : null}
        {chosenPanels(list, snapshot?.matches ?? [], itemId).map(({ item, offer, stale }) => (
          <OfferPanel key={item.id} testID={`chosen-${item.id}`}>
            <Text style={[headline, { color: theme.colors.label }]}>{`Chosen for ${item.name}`}</Text>
            <Text style={[textStyles.body, { color: theme.colors.label }]}>{`${offer.product} · ${offer.packageSize ?? 'Size not specified'} · ${offer.store}`}</Text>
            {stale ? (
              <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>This selection is no longer a current verified offer. Choose a new offer or remove it.</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || choose.isPending || list.completedAt != null }}
              disabled={busy || choose.isPending || list.completedAt != null}
              onPress={() => remove(item)}
              testID={`chosen-remove-${item.id}`}
            >
              <Text style={[textStyles.body, { color: theme.colors.danger, opacity: busy || list.completedAt != null ? 0.45 : 1 }]}>Remove selection</Text>
            </Pressable>
          </OfferPanel>
        ))}
        <OfferPanel testID="offers-labels">
          <Text style={[headline, { color: theme.colors.label }]}>How offers are labeled</Text>
          <Text style={[textStyles.subheadline, { color: theme.colors.label }]}>
            {'Matching — Your brand and stated preferences\nAvailable — Product match; no brand specified\nAlternatives — Different or unconfirmed preferences'}
          </Text>
          <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>{snapshot?.status ?? ''}</Text>
          {snapshot?.lastCheckedAt ? <Text style={[styles.caption, { color: theme.colors.label }]}>{`Last checked: ${offerDate(snapshot.lastCheckedAt)}`}</Text> : null}
          {snapshot?.sourceURL ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(snapshot.sourceURL!)} testID="offers-source">
              <Text style={[textStyles.body, { color: theme.colors.link }]}>View store source ↗</Text>
            </Pressable>
          ) : null}
        </OfferPanel>
        <Pressable accessibilityRole="button" onPress={() => setSettings(true)} style={[styles.bordered, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.12) }]} testID="offers-manage-stores">
          <Ionicons color={theme.colors.link} name="storefront-outline" size={18} />
          <Text style={[textStyles.body, { color: theme.colors.link }]}>Manage stores</Text>
        </Pressable>
      </ScrollView>
      {/* `.sheet(isPresented: $settings) { ShoppingSettings(…) }` (:81): saved, then the offers reload. */}
      <ListSettingsSheet
        list={list}
        onClose={() => setSettings(false)}
        onSave={(next) => {
          void shoppingStore
            .getState()
            .action('save', list, listInput(next))
            .then((saved) => {
              if (saved) {
                setList(saved);
                reload();
              } else setFailure(shoppingStore.getState().error);
            });
        }}
        visible={settings}
      />
    </View>
  );
}

export function OfferDetailScreen({ listId, itemId, offerId }: { listId: string; itemId: string; offerId: string }) {
  const theme = useTheme();
  const [list, setList] = useCurrentList(listId);
  const offers = useShoppingOffers(listId);
  const choose = useChooseOffer();
  const [error, setError] = useState<string | null>(null);
  const current: ShoppingOfferMatch | null = offers.data?.matches.find((value) => value.itemId === itemId && value.offer.id === offerId) ?? null;
  if (!list || !current) {
    return (
      <View style={styles.fill}>
        <TodayBackdrop />
        {offers.isFetching ? <ActivityIndicator style={styles.progress} /> : null}
      </View>
    );
  }
  const saving = choose.isPending;
  // `selected` (:103): this offer is the item's chosen offer.
  const selected = list.items.find((value) => value.id === itemId)?.chosenOffer?.id === offerId;
  const offer = current.offer;
  const toggle = () =>
    choose.mutate(
      { list, itemId, offerId: selected ? null : offerId },
      {
        onSuccess: (updated) => {
          setList(updated);
          setError(null);
        },
        onError: (caught) => setError(caught.message),
      },
    );
  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView contentContainerStyle={styles.detail} testID="offer-detail">
        <OfferPanel>
          <OfferSummary offer={offer} />
          <Text style={[headline, { color: brand.nexdoBlue }]}>{`Why this ${current.category === 'alternative' ? 'is an alternative' : 'matches'}`}</Text>
          {current.reasons.map((reason) => (
            <View key={reason} style={styles.label}>
              <Ionicons color={theme.colors.label} name="checkmark-circle-outline" size={17} />
              <Text style={[textStyles.subheadline, styles.grow, { color: theme.colors.label }]}>{reason}</Text>
            </View>
          ))}
          {current.differences.map((difference) => (
            <View key={difference} style={styles.label}>
              <Ionicons color={theme.colors.label} name="information-circle-outline" size={17} />
              <Text style={[textStyles.subheadline, styles.grow, { color: theme.colors.label }]}>{difference}</Text>
            </View>
          ))}
        </OfferPanel>
        <OfferPanel>
          <View style={styles.label}>
            <Ionicons color={theme.colors.label} name="calendar-outline" size={18} />
            <Text style={[textStyles.body, { color: theme.colors.label }]} testID="offer-valid">{`Valid through ${offerEndDate(offer.expiresAt)}`}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <Text style={[textStyles.subheadline, { color: theme.colors.label }]}>{offer.conditions}</Text>
          {offer.sourceURL ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(offer.sourceURL)} style={styles.label} testID="offer-source">
                <Ionicons color={theme.colors.link} name="pricetag-outline" size={18} />
                <Text style={[textStyles.body, { color: theme.colors.link }]}>View store offer ↗</Text>
              </Pressable>
            </>
          ) : null}
          <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
          <View style={styles.label}>
            <Ionicons color={theme.colors.label} name="time-outline" size={17} />
            <Text style={[textStyles.subheadline, { color: theme.colors.label }]}>{`Last checked ${offerDate(offer.checkedAt)}`}</Text>
          </View>
        </OfferPanel>
        {error ? (
          <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="offer-error">
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityLabel={saving ? 'Saving…' : selected ? 'Remove selection' : 'Choose this offer'}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || list.completedAt != null }}
          disabled={saving || list.completedAt != null}
          onPress={toggle}
          style={{ opacity: saving || list.completedAt != null ? 0.45 : 1 }}
          testID="offer-choose"
        >
          <LinearGradient colors={SAVE_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.choose}>
            <Text style={[headline, { color: '#FFFFFF' }]}>{saving ? 'Saving…' : selected ? 'Remove selection' : 'Choose this offer'}</Text>
          </LinearGradient>
        </Pressable>
        <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>
          Your original item preferences are preserved. The chosen product, package and store are saved with this item.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  detail: { padding: 18, gap: 18, paddingBottom: 40 },
  tabs: { gap: 8 },
  tab: { padding: 12, borderRadius: 999 },
  storeRow: { flexDirection: 'row' },
  progress: { alignItems: 'center', gap: 8, padding: 16 },
  panel: { gap: 12, padding: 20, borderRadius: 24 },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  picture: { width: 90, height: 125, alignItems: 'center', justifyContent: 'center' },
  summaryText: { gap: 8 },
  price: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  savings: { padding: 8, borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { height: StyleSheet.hairlineWidth },
  bordered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  choose: { alignItems: 'center', padding: 18, borderRadius: 999 },
});
