import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { shoppingStoresApi, type ShoppingStoreSuggestion } from '../../api/shopping';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { STORE_HOURS_ERROR, useStoreHours } from '../../query/useShoppingOffers';
import { brand, inputText, linearGradientStops, textStyles, useTheme } from '../../theme';
import { headline } from '../moments/components';
import { FormButton, FormRow, FormScroll, FormSection, FormText } from '../moments/form';

/**
 * `ShoppingStoreFinder` (ios/App/ShoppingViews.swift:693-790) and `ShoppingStoreHoursView`
 * (ios/App/ShoppingStoreHoursView.swift), the two pages List Settings pushes. In RN they are pages of
 * the List Settings sheet, so the chosen store comes back to the sheet's draft as Swift's `onSelect`.
 */

/** "Location is unavailable…" (:766), shown only after the user asked for their location. */
export const LOCATION_UNAVAILABLE = 'Location is unavailable. Enter a city or ZIP code, or allow location access in iPhone Settings.';

type Coordinate = { latitude: number; longitude: number };

/**
 * `WeatherLocationProvider.locate(requestPermission:)` (WeatherLocationProvider.swift:24-38): one
 * approximate position, rounded to two decimals. Without permission it asks only when told to.
 */
export async function locateApproximately(requestPermission: boolean): Promise<Coordinate> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) {
    if (!requestPermission || !permission.canAskAgain) throw new Error('permission');
    permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('permission');
  }
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
  return {
    latitude: Math.round(position.coords.latitude * 100) / 100,
    longitude: Math.round(position.coords.longitude * 100) / 100,
  };
}

/** `findStores()`'s body (:776-779): the name always, then the area or the coordinates. */
export function storeSearchBody(name: string, area: string, location: Coordinate | null): { name: string; area?: string; latitude?: number; longitude?: number } | null {
  const query = name.trim();
  const region = area.trim();
  // `guard region.count >= 2 || (region.isEmpty && latitude != nil && longitude != nil)`.
  if (region.length >= 2) return { name: query, area: region };
  if (region === '' && location) return { name: query, latitude: location.latitude, longitude: location.longitude };
  return null;
}

/** `String(format: "%.2f km", distance)`. */
export const distanceLabel = (km: number) => `${km.toFixed(2)} km`;

const SAVE_GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

export function StoreFinderPage({ initialArea, onSelect }: { initialArea: string; onSelect: (store: ShoppingStoreSuggestion) => void }) {
  const theme = useTheme();
  const [area, setArea] = useState(initialArea);
  const [name, setName] = useState('');
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<{ key: string; message: string } | null>(null);
  const [revision, setRevision] = useState(0);
  // The newest search's answer, keyed by `searchKey`: an answer for an older key is never shown.
  const [answer, setAnswer] = useState<{ key: string; stores: ShoppingStoreSuggestion[]; error: string | null } | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const body = storeSearchBody(name, area, location);
  // `searchKey` (:707).
  const searchKey = `${name}|${area}|${location?.latitude ?? 0}|${location?.longitude ?? 0}|${revision}`;
  const current = answer?.key === searchKey ? answer : null;
  const suggestions = current?.stores ?? [];
  const searchBusy = body !== null && started === searchKey && current === null;
  const searchError = current?.error ?? (locationError?.key === searchKey ? locationError.message : null);

  /** `useLocation(requestPermission:)` (:760-767). */
  const locate = async (requestPermission: boolean) => {
    setLocationBusy(true);
    try {
      const coordinate = await locateApproximately(requestPermission);
      setLocation(coordinate);
      setArea('');
      setRevision((value) => value + 1);
    } catch {
      if (requestPermission) setLocationError({ key: searchKey, message: LOCATION_UNAVAILABLE });
    } finally {
      setLocationBusy(false);
    }
  };
  const locateRef = useRef(locate);
  useEffect(() => {
    locateRef.current = locate;
  });

  // `.task { if area.isEmpty { await useLocation(requestPermission: false) } }`, once on open.
  useEffect(() => {
    if (initialArea !== '') return;
    const timer = setTimeout(() => void locateRef.current(false), 0);
    return () => clearTimeout(timer);
  }, [initialArea]);

  // `.task(id: searchKey) { await findStores() }`: 600 ms after the last change.
  useEffect(() => {
    if (!body) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setStarted(searchKey);
      shoppingStoresApi
        .search(body)
        .then((result) => {
          if (!cancelled) setAnswer({ key: searchKey, stores: result.stores, error: null });
        })
        .catch((error: unknown) => {
          if (!cancelled) setAnswer({ key: searchKey, stores: [], error: error instanceof Error ? error.message : 'Request failed.' });
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `body` is derived from the key's parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  const field = (placeholder: string, value: string, onChange: (next: string) => void, icon: keyof typeof Ionicons.glyphMap, testID: string) => (
    <View style={[styles.field, { backgroundColor: theme.colors.surface }]}>
      <Ionicons color={theme.colors.link} name={icon} size={17} />
      <TextInput
        accessibilityLabel={placeholder}
        autoCorrect={false}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.placeholder}
        returnKeyType="search"
        style={[inputText(textStyles.body), styles.grow, { color: theme.colors.ink }]}
        testID={testID}
        value={value}
      />
    </View>
  );

  return (
    <View style={styles.fill} testID="stores-near-you">
      <TodayBackdrop />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.searchCard, { backgroundColor: withAlpha(theme.colors.surface, 0.72) }]}>
          {field('City or ZIP code', area, setArea, 'location-outline', 'stores-area')}
          {field('Search by store name', name, setName, 'search', 'stores-name')}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: locationBusy }}
            disabled={locationBusy}
            onPress={() => void locate(true)}
            style={styles.locationButton}
            testID="stores-use-location"
          >
            <Ionicons color={theme.colors.link} name="navigate" size={15} />
            <Text style={[textStyles.subheadline, styles.semibold, { color: theme.colors.link }]}>{locationBusy ? 'Finding your location…' : 'Use my location'}</Text>
          </Pressable>
          {location && area === '' ? (
            <Text style={[styles.caption, styles.centered, { color: theme.colors.secondary }]}>Near your current location · Distances are straight-line estimates</Text>
          ) : null}
        </View>
        {searchBusy ? (
          <View style={styles.progress} testID="stores-busy">
            <ActivityIndicator />
            <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]}>Finding stores…</Text>
          </View>
        ) : null}
        {searchError ? (
          <>
            <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]} testID="stores-error">
              {searchError}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setRevision((value) => value + 1)} testID="stores-retry">
              <Text style={[textStyles.body, { color: theme.colors.link }]}>Try again</Text>
            </Pressable>
          </>
        ) : null}
        {!searchBusy && searchError === null && suggestions.length === 0 ? (
          <View style={styles.emptyRow} testID="stores-empty">
            <Ionicons color={theme.colors.secondary} name="storefront-outline" size={20} />
            <Text style={[textStyles.body, styles.grow, { color: theme.colors.secondary }]}>
              {area === '' && location === null ? 'Enter a city or ZIP code, or use your location to find grocery stores.' : 'No stores found. Try another location or store name.'}
            </Text>
          </View>
        ) : null}
        {suggestions.map((suggestion) => (
          <View key={suggestion.id} style={[styles.storeCard, { backgroundColor: theme.colors.surface }]} testID={`store-${suggestion.id}`}>
            <View style={[styles.storeIcon, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.08) }]}>
              <Ionicons color={theme.colors.link} name="storefront" size={24} />
            </View>
            <View style={[styles.grow, styles.storeText]}>
              <Text style={[headline, { color: theme.colors.ink }]}>{suggestion.name}</Text>
              <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>{suggestion.address}</Text>
              {suggestion.distanceKm != null ? <Text style={[styles.caption, { color: brand.nexdoBlue }]}>{distanceLabel(suggestion.distanceKm)}</Text> : null}
              {suggestion.attributions.map((attribution) => (
                <Text key={attribution} style={[styles.caption2, { color: theme.colors.secondaryLabel }]}>
                  {attribution}
                </Text>
              ))}
              <Pressable accessibilityLabel={`Add ${suggestion.name}, ${suggestion.address}`} accessibilityRole="button" onPress={() => onSelect(suggestion)} testID={`store-add-${suggestion.id}`}>
                <LinearGradient colors={SAVE_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.add}>
                  <Text style={[textStyles.subheadline, styles.bold, { color: '#FFFFFF' }]}>Add</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ))}
        {suggestions.length > 0 ? <Text style={[styles.caption, styles.medium, styles.centered, { color: theme.colors.secondary }]}>Google Maps</Text> : null}
      </ScrollView>
    </View>
  );
}

/** `ShoppingStoreHoursView`: the store's name, open now, the days, and Google Maps. */
export function StoreHoursPage({ placeId, name, mapsUrl }: { placeId: string | null; name: string; mapsUrl: string | null }) {
  const theme = useTheme();
  const hours = useStoreHours(placeId);
  const result = hours.data ?? null;
  const busy = hours.isFetching;
  const error = hours.isError && !busy ? STORE_HOURS_ERROR : null;
  const rows: { key: string; node: ReactNode }[] = [{ key: 'name', node: <Text style={[headline, { color: theme.colors.label }]}>{name}</Text> }];
  if (busy) {
    rows.push({
      key: 'busy',
      node: (
        <View style={styles.progressRow} testID="store-hours-busy">
          <ActivityIndicator />
          <FormText>Loading store hours…</FormText>
        </View>
      ),
    });
  }
  if (result && !busy) {
    if (result.openNow != null) {
      rows.push({
        key: 'open',
        node: (
          <Text style={[textStyles.body, { color: result.openNow ? '#34C759' : theme.colors.secondaryLabel }]} testID="store-hours-open">
            {result.openNow ? 'Open now' : 'Closed now'}
          </Text>
        ),
      });
    }
    if (result.days.length === 0) rows.push({ key: 'none', node: <FormText>No hours provided for this store.</FormText> });
    result.days.forEach((day, index) => rows.push({ key: `day-${index}`, node: <FormText>{day}</FormText> }));
    rows.push({
      key: 'note',
      node: (
        <FormText caption tone="secondary">
          {result.current ? 'Hours for the next seven days · Store local time' : 'Regular hours · Holiday hours may differ'}
        </FormText>
      ),
    });
  }
  if (error) rows.push({ key: 'error', node: <FormText tone="secondary">{error}</FormText> });
  if (placeId === null) rows.push({ key: 'choose', node: <FormText tone="secondary">Choose this location using Add New Store to load its hours.</FormText> });
  if (error) rows.push({ key: 'retry', node: <FormButton title="Try again" onPress={() => void hours.refetch()} testID="store-hours-retry" /> });
  return (
    <FormScroll testID="store-hours">
      <FormSection header="Store hours">
        {rows.map((row, index) => (
          <FormRow key={row.key} last={index === rows.length - 1}>
            {row.node}
          </FormRow>
        ))}
      </FormSection>
      {mapsUrl ? (
        <FormSection>
          <FormRow last>
            <FormButton title="View store on Google Maps" onPress={() => void Linking.openURL(mapsUrl)} testID="store-hours-maps" />
          </FormRow>
        </FormSection>
      ) : null}
      <View style={styles.attribution}>
        <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>Google Maps</Text>
      </View>
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  medium: { fontWeight: '500' },
  centered: { textAlign: 'center' },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  searchCard: { gap: 12, padding: 16, borderRadius: 22 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, minHeight: 48, borderRadius: 16 },
  locationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  progress: { alignItems: 'center', gap: 8, padding: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16 },
  storeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 20 },
  storeIcon: { width: 48, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  storeText: { gap: 5, alignItems: 'flex-start' },
  add: { paddingHorizontal: 22, paddingVertical: 9, borderRadius: 999 },
  attribution: { marginHorizontal: 32, marginTop: 4 },
});
