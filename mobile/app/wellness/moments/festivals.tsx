import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { withAlpha } from '../../../src/components/SignInBackdrop';
import { Text } from '../../../src/components/Text';
import { TodayBackdrop } from '../../../src/components/TodayShell';
import { FESTIVAL_REGIONS, festivalMomentInput } from '../../../src/features/moments/device';
import { useAccessibilityTextSize } from '../../../src/features/wellness/useAccessibilityTextSize';
import { brand, textStyles, useTheme, type Theme } from '../../../src/theme';

/**
 * `MomentFestivalView` (ios/App/MomentEditor.swift:306-535), redesigned in Phase 12: a hero, "Explore by
 * region" cards (tap one to filter, again to show every region), the festivals as a list that opens the
 * editor with a "<name> Wishes" festival whose date must be confirmed, and a closing note. Moving dates
 * are never guessed; catalog dates come from the server's `festivalCatalog` later.
 */

/** `regions` (:310), in Swift's order — no longer sorted. */
const REGIONS = ['Global', 'India', 'United States', 'East Asia'];

type IconName = keyof typeof Ionicons.glyphMap;

/** `regionSymbol(_:)` (:509-516): sun.max, star, moon.stars, globe. */
function regionIcon(name: string): IconName {
  switch (name) {
    case 'India':
      return 'sunny-outline';
    case 'United States':
      return 'star-outline';
    case 'East Asia':
      return 'moon-outline';
    default:
      return 'globe-outline';
  }
}

/** `festivalSymbol(_:)` (:517-527): sparkles, heart, flame, paintpalette, moon.stars, leaf, gift. */
function festivalIcon(name: string): IconName {
  switch (name) {
    case 'New Year':
    case 'Lunar New Year':
      return 'sparkles-outline';
    case 'International Friendship Day':
      return 'heart-outline';
    case 'Diwali':
      return 'flame-outline';
    case 'Holi':
      return 'color-palette-outline';
    case 'Eid':
    case 'Mid-Autumn Festival':
      return 'moon-outline';
    case 'Pongal':
    case 'Thanksgiving':
      return 'leaf-outline';
    default:
      return 'gift-outline';
  }
}

/**
 * `accent` (:328): indigo in light; in dark, Swift's own lavender (0.73, 0.67, 1). ANDROID dark: the
 * `link` token, as every dark-mode tappable (android-polish.md §6).
 */
function accentColor(theme: Theme): string {
  if (theme.scheme !== 'dark') return theme.colors.link;
  return Platform.OS === 'android' ? theme.colors.link : '#BAABFF';
}

export default function ChooseFestivalsScreen() {
  const theme = useTheme();
  const large = useAccessibilityTextSize();
  const [region, setRegion] = useState<string | null>(null);
  const accent = accentColor(theme);
  const visible = region ? (FESTIVAL_REGIONS[region] ?? []) : REGIONS.flatMap((name) => FESTIVAL_REGIONS[name] ?? []);
  // `.secondarySystemGroupedBackground`: white in light, #1C1C1E in dark (`festivals-v2`).
  const surface = theme.colors.surface;

  return (
    <View style={styles.fill}>
      <TodayBackdrop subtle />
      <ScrollView contentContainerStyle={styles.content} testID="festivals">
        <View style={styles.column}>
          {/* `hero` (:356-389) */}
          <View style={[styles.heroShadow, { shadowColor: brand.nexdoIndigo, shadowOpacity: theme.scheme === 'dark' ? 0.1 : 0.18 }]}>
            <View style={styles.hero} testID="festivals-hero">
              <LinearGradient colors={['#261F99', brand.nexdoIndigo, '#8514B3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={styles.heroRing} />
              <View style={styles.heroTop}>
                <Ionicons name="sparkles" size={11} color="#FFFFFF" />
                <Text style={styles.heroEyebrow}>MOMENTS THAT MATTER</Text>
                <View style={styles.grow} />
                <View accessible={false} style={styles.heroGift}>
                  <Ionicons name="gift" size={22} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.heroTitle}>{'Make every\ncelebration count.'}</Text>
              <Text style={styles.heroSubtitle}>{'A thoughtful wish. A closer connection.\nFind the festivals you love to celebrate.'}</Text>
            </View>
          </View>

          {/* `regionPicker` (:391-440): two columns, one at an accessibility text size. */}
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={[styles.title3, { color: theme.colors.ink }]}>Explore by region</Text>
              <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>Discover celebrations close to home and around the world.</Text>
            </View>
            <View style={styles.grid}>
              {REGIONS.map((name) => {
                const selected = region === name;
                const count = FESTIVAL_REGIONS[name]?.length ?? 0;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}, ${count} celebrations`}
                    accessibilityHint="Filters the festival list. Tap again to show all regions."
                    accessibilityState={{ selected }}
                    onPress={() => setRegion(selected ? null : name)}
                    style={[
                      styles.regionCard,
                      large ? styles.fullWidth : styles.halfWidth,
                      { backgroundColor: selected ? withAlpha(accent, 0.1) : surface, borderColor: selected ? accent : withAlpha(accent, 0.12), borderWidth: selected ? 1.5 : 1 },
                    ]}
                    testID={`festival-region-${name}`}
                  >
                    <Ionicons name={regionIcon(name)} size={21} color={accent} style={styles.regionIcon} />
                    <View style={styles.grow}>
                      <Text style={[textStyles.subheadline, styles.semibold, styles.regionName, { color: theme.colors.ink }]}>{name}</Text>
                      <Text style={[styles.caption, { color: theme.colors.secondary }]}>{`${count} celebrations`}</Text>
                    </View>
                    {/* Swift's trailing mark takes a column of its own. On a 360 dp phone that left the text
                        narrower than "celebrations", which Android then broke mid-word; the mark sits in the
                        same corner but over the card, and only the title keeps clear of it. */}
                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={selected ? accent : withAlpha(theme.colors.secondary, 0.5)} style={styles.regionMark} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* `celebrationList` (:442-494) */}
          <View style={styles.section}>
            <View style={styles.listHeading}>
              <View style={styles.grow}>
                <Text style={[styles.title3, { color: theme.colors.ink }]}>{region ? `Celebrate in ${region}` : 'Find your next celebration'}</Text>
                <Text style={[styles.caption, { color: theme.colors.secondary }]}>{`${visible.length} festivals to make your own`}</Text>
              </View>
              {region ? (
                <Pressable accessibilityRole="button" onPress={() => setRegion(null)} style={styles.allRegions} testID="festival-all-regions">
                  {/* A plain Button under the screen's `.foregroundStyle(Color.nexdoInk)`: ink, not the tint. */}
                  <Text style={[textStyles.subheadline, styles.semibold, { color: theme.colors.ink }]}>All regions</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={[styles.list, { backgroundColor: surface, borderColor: withAlpha(accent, 0.1) }]}>
              {visible.map((name, index) => (
                <View key={name}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/wellness/moments/editor', params: { imported: JSON.stringify(festivalMomentInput(name)), done: 'back' } })}
                    style={styles.festivalRow}
                    testID={`festival-choice-${name}`}
                  >
                    <LinearGradient colors={[withAlpha(brand.nexdoBlue, 0.12), withAlpha(brand.nexdoMagenta, 0.1)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.festivalIcon}>
                      <Ionicons name={festivalIcon(name)} size={21} color={accent} />
                    </LinearGradient>
                    <View style={styles.grow}>
                      <Text style={[textStyles.body, styles.semibold, { color: theme.colors.ink }]}>{name}</Text>
                      <Text style={[styles.caption, { color: theme.colors.secondary }]}>Create a thoughtful wish</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={13} color={withAlpha(accent, 0.65)} />
                  </Pressable>
                  {index < visible.length - 1 ? <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} /> : null}
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.note, { backgroundColor: withAlpha(accent, 0.06) }]}>
            <Ionicons name="calendar-outline" size={15} color={theme.colors.secondary} />
            <Text style={[styles.footnote, styles.grow, { color: theme.colors.secondary }]}>You’ll review the date and recipients before saving. Festival dates can vary each year.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  // `.padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 28).frame(maxWidth: 680)`
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  column: { gap: 26, width: '100%', maxWidth: 680, alignSelf: 'center' },
  title3: { ...textStyles.title3, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  footnote: { fontSize: 13, lineHeight: 18 },
  heroShadow: { borderRadius: 28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  hero: { borderRadius: 28, overflow: 'hidden', padding: 24, gap: 16 },
  // `Circle().stroke(.white.opacity(0.10), lineWidth: 30)` 190 wide, offset (65, 85) from the corner.
  heroRing: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 30, borderColor: 'rgba(255, 255, 255, 0.10)', right: -65, bottom: -85 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: { fontSize: 11, lineHeight: 13, fontWeight: '700', letterSpacing: 1.5, color: '#FFFFFF' },
  heroGift: { padding: 12, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  heroTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', color: '#FFFFFF' },
  heroSubtitle: { fontSize: 15, lineHeight: 24, color: 'rgba(255, 255, 255, 0.92)' },
  section: { gap: 14 },
  sectionHeading: { gap: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  halfWidth: { width: '47.5%', flexGrow: 1 },
  fullWidth: { width: '100%' },
  regionCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, minHeight: 84, borderRadius: 20 },
  regionMark: { position: 'absolute', top: 14, right: 14 },
  regionName: { marginRight: 23 },
  regionIcon: { width: 30, height: 32, textAlign: 'center' },
  listHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  allRegions: { paddingVertical: 12 },
  list: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  festivalRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  festivalIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 78, marginRight: 16 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 16, borderRadius: 18 },
});
