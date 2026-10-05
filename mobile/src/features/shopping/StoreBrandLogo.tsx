import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shoppingStoresApi } from '../../api/shopping';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';
import { headline, systemColors } from '../moments/components';

/**
 * `StoreBrandLogo` (ios/App/StoreBrandLogo.swift): "Reusable store-level logo. Backend owns
 * identity/matching/cache; SwiftUI never receives a provider credential or guesses a retailer from the
 * list title." The server names the brand and a logo on `cdn.brandfetch.io`; anything else, or any
 * failure, keeps the green cart. With `expandsOnTap`, a loaded logo opens full size.
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

export function StoreBrandLogo({ listId, identity, size = 56, expandsOnTap = false }: { listId: string; identity: string; size?: number; expandsOnTap?: boolean }) {
  const theme = useTheme();
  const key = `${listId}|${identity}`;
  const [state, setState] = useState<{ key: string; uri: string | null; label: string }>(() => ({ key, uri: cached(key)?.uri ?? null, label: cached(key)?.label ?? 'Shopping list' }));
  const [loaded, setLoaded] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  if (state.key !== key) setState({ key, uri: cached(key)?.uri ?? null, label: cached(key)?.label ?? 'Shopping list' });

  // `.task(id: "\(listID)|\(identity)") { await load() }`
  useEffect(() => {
    let cancelled = false;
    if (cached(key) || identity.replaceAll('|', '') === '') return;
    shoppingStoresApi
      .brand(listId)
      .then(({ brand }) => {
        if (cancelled) return;
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
  }, [key, listId, identity]);

  const showing = state.uri !== null && loaded === state.uri;
  const avatar = (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: showing ? '#FFFFFF' : withAlpha(systemColors.green, 0.14), borderColor: withAlpha(systemColors.green, 0.12) },
      ]}
    >
      {showing ? null : <Ionicons color={systemColors.green} name="cart" size={size * 0.5} />}
      {state.uri ? (
        <Image
          accessible={false}
          onError={() => setLoaded(null)}
          onLoad={() => setLoaded(state.uri)}
          resizeMode="contain"
          // No persistent redistribution of provider assets (:79): iOS skips the URL cache.
          source={{ uri: state.uri, cache: Platform.OS === 'ios' ? 'reload' : undefined }}
          style={[styles.logo, { width: size * 0.94, height: size * 0.94, opacity: showing ? 1 : 0 }]}
          testID="store-brand-image"
        />
      ) : null}
    </View>
  );

  return (
    <>
      {expandsOnTap && showing ? (
        <Pressable accessibilityLabel={`Expand ${state.label} logo`} accessibilityRole="button" onPress={() => setExpanded(true)} testID="shopping-store-logo-preview">
          {avatar}
        </Pressable>
      ) : (
        <View accessibilityLabel={showing ? `${state.label} logo` : 'Shopping list'} accessible testID="store-brand-logo">
          {avatar}
        </View>
      )}
      {expandsOnTap ? (
        <Modal animationType="slide" onRequestClose={() => setExpanded(false)} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} visible={expanded}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.sheet}>
            <View style={styles.bar}>
              <View style={styles.side} />
              <Text accessibilityRole="header" numberOfLines={1} style={[headline, styles.title, { color: '#000000' }]}>
                {state.label}
              </Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded(false)} style={[styles.side, styles.trailing]} testID="store-logo-done">
                <Text style={[headline, { color: theme.colors.link }]}>Done</Text>
              </Pressable>
            </View>
            {state.uri ? <Image accessibilityLabel={`${state.label} logo`} resizeMode="contain" source={{ uri: state.uri }} style={styles.large} /> : null}
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
