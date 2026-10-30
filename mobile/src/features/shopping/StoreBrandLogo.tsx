import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shoppingStoresApi, type StoreBrandMetadata } from '../../api/shopping';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';
import { headline, systemColors } from '../moments/components';

/**
 * `StoreBrandLogo` (ios/App/StoreBrandLogo.swift): "Reusable store-level logo. Backend owns
 * identity/matching/cache; SwiftUI never receives a provider credential or guesses a retailer from the
 * list title." The server names the brand and a logo on `cdn.brandfetch.io`; anything else, or any
 * failure, keeps the green cart. With `expandsOnTap`, a loaded logo opens full size.
 *
 * bdb68ce: a list's own logo (`customImageData`, the list's `storeLogoData`) comes first, labelled with
 * the store name; the brand lookup runs only when there is none, or it cannot be drawn.
 */

/**
 * The logo URL rules (:74-77): https, host `cdn.brandfetch.io`, no user, password or port, and no query
 * parameter other than `c`. `null` for anything else.
 */
export function safeLogoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^https:\/\/([^/?#]*)(\/[^?#]*)?(?:\?([^#]*))?(?:#.*)?$/.exec(raw);
  if (!match) return null;
  const authority = match[1];
  if (authority !== 'cdn.brandfetch.io') return null;
  const query = match[3];
  if (query !== undefined && query !== '') {
    for (const pair of query.split('&')) {
      if (pair.split('=')[0] !== 'c') return null;
    }
  }
  return raw;
}

type Entry = { uri: string | null; label: string; expires: number };

/**
 * `StoreBrandLogoCache` (:117-132): brief, bounded in-memory reuse — 60 seconds, at most 30 — so
 * reopening a list is immediate. Keyed by list and store identity.
 */
const cache = new Map<string, Entry>();
const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 30;

/** Test seam. */
export function clearStoreBrandCache() {
  cache.clear();
}

function cached(key: string): Entry | null {
  const entry = cache.get(key);
  if (!entry || entry.expires <= Date.now()) return null;
  return entry;
}

/**
 * The logo a store search row already carries (ce6d20a, `suppliedBrand`, StoreBrandLogo.swift:18, :86-88),
 * or `null` for the cart: no brand (an older server), no logo URL, or one that breaks the URL rules.
 */
export function suppliedLogo(brand: StoreBrandMetadata | null | undefined): { uri: string; label: string } | null {
  const uri = safeLogoUrl(brand?.logoUrl);
  return brand && uri ? { uri, label: brand.displayName } : null;
}

/**
 * `GET /api/shopping/store-brand`, retried after 1 s and then 2 s while it answers with no logo (ce6d20a,
 * StoreBrandLogo.swift:89-93): another view may be resolving the same brand under the server's cache lease.
 * Stops as soon as the view is gone.
 */
export async function lookUp(listId: string, cancelled: () => boolean, wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms))): Promise<StoreBrandMetadata | null> {
  let { brand } = await shoppingStoresApi.brand(listId);
  for (const delay of [1000, 2000]) {
    if (brand.logoUrl != null) break;
    await wait(delay);
    if (cancelled()) return null;
    ({ brand } = await shoppingStoresApi.brand(listId));
  }
  return cancelled() ? null : brand;
}

export function StoreBrandLogo({
  listId,
  identity,
  customImageData,
  automaticLookup = true,
  suppliedBrand,
  size = 56,
  expandsOnTap = false,
}: {
  listId: string;
  identity: string;
  /** The list's own logo: bare JPEG base64 (`storeLogoData`). */
  customImageData?: string | null;
  /** `automaticLookup` (:17): `false` never calls `store-brand`, so only `suppliedBrand` can draw a logo. */
  automaticLookup?: boolean;
  /** `suppliedBrand` (:18): used instead of the lookup, with no retry. */
  suppliedBrand?: StoreBrandMetadata | null;
  size?: number;
  expandsOnTap?: boolean;
}) {
  const theme = useTheme();
  const key = `${listId}|${identity}`;
  // `if let customImageData, let data = Data(base64Encoded:), let custom = UIImage(data:)` (load(), :63-65):
  // the custom image wins, labelled with the identity's name part. One that cannot be drawn falls
  // through to the brand lookup, as Swift's failed decode does.
  const custom = customImageData ? `data:image/jpeg;base64,${customImageData}` : null;
  const [customFailed, setCustomFailed] = useState<string | null>(null);
  const usingCustom = custom !== null && customFailed !== custom;
  const [state, setState] = useState<{ key: string; uri: string | null; label: string }>(() => ({ key, uri: cached(key)?.uri ?? null, label: cached(key)?.label ?? 'Shopping list' }));
  const [loaded, setLoaded] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  if (state.key !== key) setState({ key, uri: cached(key)?.uri ?? null, label: cached(key)?.label ?? 'Shopping list' });

  // A supplied brand replaces the lookup (`if let suppliedBrand { result = Result(brand: suppliedBrand) }`,
  // :86-87), so it is read straight from the prop and never fetched or retried.
  const supplied = suppliedBrand != null;
  const fromSearch = supplied && identity.replaceAll('|', '') !== '' ? suppliedLogo(suppliedBrand) : null;

  // `.task(id: "\(cacheKey)|\(customImageData ?? "")|\(automaticLookup)|\(suppliedBrand?.logoUrl ?? "")") { await load() }`
  useEffect(() => {
    let cancelled = false;
    // `guard automaticLookup || suppliedBrand != nil else { image = nil; return }` (:66).
    if (usingCustom || supplied || !automaticLookup || cached(key) || identity.replaceAll('|', '') === '') return;
    lookUp(listId, () => cancelled)
      .then((brand) => {
        if (cancelled || !brand) return;
        const uri = safeLogoUrl(brand.logoUrl);
        if (!uri) return;
        if (cache.size >= CACHE_LIMIT) cache.clear();
        cache.set(key, { uri, label: brand.displayName, expires: Date.now() + CACHE_TTL_MS });
        setState({ key, uri, label: brand.displayName });
      })
      // "A missing logo must never interrupt shopping."
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key, listId, identity, usingCustom, automaticLookup, supplied]);

  const uri = usingCustom ? custom : supplied ? (fromSearch?.uri ?? null) : state.uri;
  // `identity.components(separatedBy: "|").first ?? "Store"`: a list with a custom logo and no store
  // name would read " logo", so the name falls back to "Store" as Swift's `??` intends.
  const label = usingCustom ? identity.split('|')[0] || 'Store' : supplied ? (fromSearch?.label ?? 'Shopping list') : state.label;
  const showing = uri !== null && loaded === uri;
  const avatar = (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: showing ? '#FFFFFF' : withAlpha(systemColors.green, 0.14), borderColor: withAlpha(systemColors.green, 0.12) },
      ]}
    >
      {showing ? null : <Ionicons color={systemColors.green} name="cart" size={size * 0.5} />}
      {uri ? (
        <Image
          accessible={false}
          onError={() => (usingCustom ? setCustomFailed(custom) : setLoaded(null))}
          onLoad={() => setLoaded(uri)}
          resizeMode="contain"
          // No persistent redistribution of provider assets (:79): iOS skips the URL cache.
          source={{ uri, cache: Platform.OS === 'ios' && !usingCustom ? 'reload' : undefined }}
          style={[styles.logo, { width: size * 0.94, height: size * 0.94, opacity: showing ? 1 : 0 }]}
          testID="store-brand-image"
        />
      ) : null}
    </View>
  );

  return (
    <>
      {expandsOnTap && showing ? (
        <Pressable accessibilityLabel={`Expand ${label} logo`} accessibilityRole="button" onPress={() => setExpanded(true)} testID="shopping-store-logo-preview">
          {avatar}
        </Pressable>
      ) : (
        <View accessibilityLabel={showing ? `${label} logo` : 'Shopping list'} accessible testID="store-brand-logo">
          {avatar}
        </View>
      )}
      {expandsOnTap ? (
        <Modal animationType="slide" onRequestClose={() => setExpanded(false)} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} visible={expanded}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.sheet}>
            <View style={styles.bar}>
              <View style={styles.side} />
              <Text accessibilityRole="header" numberOfLines={1} style={[headline, styles.title, { color: '#000000' }]}>
                {label}
              </Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded(false)} style={[styles.side, styles.trailing]} testID="store-logo-done">
                <Text style={[headline, { color: theme.colors.link }]}>Done</Text>
              </Pressable>
            </View>
            {uri ? <Image accessibilityLabel={`${label} logo`} resizeMode="contain" source={{ uri }} style={styles.large} /> : null}
          </SafeAreaView>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1 },
  logo: { position: 'absolute' },
  sheet: { flex: 1, backgroundColor: '#FFFFFF' },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 16 },
  side: { minWidth: 60 },
  trailing: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
  large: { flex: 1, margin: 24 },
});
