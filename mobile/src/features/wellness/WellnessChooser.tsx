import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { withAlpha } from '../../components/SignInBackdrop';
import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { MENU_ART, MENU_HERO, MENU_HERO_ACCENT, WELLNESS_NAVIGATION, type WellnessModule } from './art';
import { fixedLightIndigo, nexdoSecondary, swiftColors } from './style';

/**
 * `WellnessChooserView` (ios/App/WellnessChooserView.swift:5-117): the hero, four module cards, the
 * quote, and the chooser's own bottom bar with the Wellness button selected. Every size scales with
 * `min(width / 393, 1.4)`, as Swift's `GeometryReader` does. Fixed light colours, as Swift's.
 *
 * Swift mounts two more destinations (`insights`, `profile`) that no card opens; they are not built.
 */

const INK = '#090930'; // Color(red: 0.035, green: 0.035, blue: 0.19)

/** `module(_:title:subtitle:tags:color:…)` calls (:19-22), in Swift's order. */
export const WELLNESS_MODULES: { module: WellnessModule; title: string; subtitle: string; tags: string; color: string }[] = [
  { module: 'shopping', title: 'Shopping List', subtitle: 'Plan, shop and save time', tags: 'Groceries  ·  Send to store  ·  Stay organized', color: '#00753B' },
  { module: 'calories', title: 'Calorie Tracker', subtitle: 'Track your meals, goals & nutrition', tags: 'Eat well  ·  Feel great  ·  Stay healthy', color: '#C74500' },
  { module: 'pomodoro', title: 'Pomodoro Focus', subtitle: 'Make time for deep work', tags: 'Focus  ·  Be productive  ·  Get more done', color: fixedLightIndigo },
  { module: 'moments', title: 'Moments', subtitle: 'Remember what matters', tags: 'Birthdays  ·  Festivals  ·  Special occasions', color: '#DE145E' },
];

export type WellnessChooserProps = {
  onModule: (module: WellnessModule) => void;
  onExit: (exit: 'home' | 'tasks' | 'askAI' | 'calendar') => void;
};

export function WellnessChooser({ onModule, onExit }: WellnessChooserProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = Math.min(width / 393, 1.4);
  return (
    <View style={styles.fill} testID="wellness-chooser">
      <LinearGradient colors={['#FAF7FF', '#FFFFFF', '#F0F5FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top }}>
        <Hero scale={scale} />
        <View style={{ gap: 10 * scale, paddingHorizontal: 14 * scale }}>
          {WELLNESS_MODULES.map((item) => (
            <ModuleCard key={item.module} {...item} scale={scale} onPress={() => onModule(item.module)} />
          ))}
        </View>
        <View style={{ marginHorizontal: 14 * scale, marginTop: 17 * scale, marginBottom: 24, borderRadius: 20 * scale, overflow: 'hidden' }}>
          <LinearGradient
            colors={[withAlpha(swiftColors.indigo, 0.07), withAlpha(swiftColors.blue, 0.12)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.quote, { padding: 22 * scale }]}
          >
            <Text style={{ fontSize: 58 * scale, lineHeight: 64 * scale, fontWeight: '700', color: withAlpha(swiftColors.indigo, 0.75) }}>“</Text>
            <Text style={[styles.quoteText, { fontSize: 15 * scale, lineHeight: 20 * scale, color: INK }]}>{'“A more organized you,\na brighter tomorrow.” — NexDo'}</Text>
          </LinearGradient>
        </View>
      </ScrollView>
      <BottomBar onExit={onExit} bottom={insets.bottom} />
    </View>
  );
}

/** `hero(scale:)` (:63-82). */
function Hero({ scale }: { scale: number }) {
  return (
    <View style={{ height: 192 * scale, overflow: 'hidden' }}>
      <LinearGradient
        colors={[withAlpha(swiftColors.pink, 0.05), withAlpha(swiftColors.blue, 0.1), withAlpha(swiftColors.purple, 0.07)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Region source={MENU_HERO} style={{ position: 'absolute', bottom: 0, right: 64 * scale, width: 140 * scale, height: 190 * scale }} />
      <Region
        source={MENU_HERO_ACCENT}
        style={{ position: 'absolute', top: 42 * scale, right: 8, width: 75 * scale, height: 57 * scale, transform: [{ rotate: '-8deg' }] }}
      />
      <View style={{ paddingLeft: 32 * scale, paddingTop: 28 * scale, gap: 10 * scale }}>
        <Text accessibilityRole="header" style={{ fontSize: 30 * scale, lineHeight: 34 * scale, fontWeight: '700', letterSpacing: -0.8, color: INK }}>
          {'A little time\nfor you'}
        </Text>
        <Text style={{ fontSize: 11.5 * scale, lineHeight: 15 * scale, color: nexdoSecondary }}>{'Nourish your day. Organize your life.\nFocus on what matters.'}</Text>
      </View>
    </View>
  );
}

/** `WellnessPackRegion` with `.blendMode(.multiply)`: the cut-out art on its white sheet background. */
function Region({ source, style }: { source: ImageSourcePropType; style: object }) {
  return <Image accessible={false} resizeMode="contain" source={source} style={[styles.multiply, style]} />;
}

/** `module(_:…)` (:83-110). */
function ModuleCard({ module, title, subtitle, tags, color, scale, onPress }: (typeof WELLNESS_MODULES)[number] & { scale: number; onPress: () => void }) {
  const art = MENU_ART[module];
  return (
    <Pressable accessibilityLabel={`${title}, ${subtitle}`} accessibilityRole="button" onPress={onPress} testID={`wellness.${module}`}>
      <View style={[styles.card, { borderRadius: 18 * scale, minHeight: 92 * scale, borderColor: withAlpha(color, 0.1) }]}>
        <LinearGradient colors={['#FFFFFF', withAlpha(color, 0.055)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* `.background(alignment: .trailing)`: centred vertically, 30 in from the trailing edge. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.artSlot, { paddingRight: 30 * scale }]}>
          <Region source={art.art} style={{ width: 77 * scale, height: 81 * scale, opacity: 0.9 }} />
        </View>
        <View style={[styles.cardRow, { gap: 15 * scale, paddingHorizontal: 16 * scale, paddingVertical: 17 * scale }]}>
          <Image accessible={false} source={art.icon} style={{ width: 51 * scale, height: 51 * scale, borderRadius: 14 }} />
          <View style={[styles.grow, { gap: 5 * scale }]}>
            <Text style={{ fontSize: 15 * scale, lineHeight: 19 * scale, fontWeight: '700', color: INK }}>{title}</Text>
            <Text style={{ fontSize: 10.5 * scale, lineHeight: 14 * scale, color: nexdoSecondary, maxWidth: 158 * scale }}>{subtitle}</Text>
            <View style={[styles.tagCapsule, { backgroundColor: 'rgba(255, 255, 255, 0.96)' }]}>
              <Text
                style={{
                  fontSize: 8.5 * scale,
                  lineHeight: 11 * scale,
                  fontWeight: '500',
                  color,
                  paddingHorizontal: 7 * scale,
                  paddingVertical: 4 * scale,
                  backgroundColor: withAlpha(color, 0.08),
                }}
              >
                {tags}
              </Text>
            </View>
          </View>
          <View style={[styles.arrow, { width: 36 * scale, height: 36 * scale, borderRadius: 18 * scale }]}>
            <TaskSymbol name="arrow.right" size={20 * scale} color={color} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** `bottomBar` (:111-121) and `footer(_:icon:action:)` (:122-133). */
function BottomBar({ onExit, bottom }: { onExit: WellnessChooserProps['onExit']; bottom: number }) {
  const footer = (title: string, icon: 'sun.max' | 'checkmark.circle' | 'sparkles' | 'calendar', exit: Parameters<WellnessChooserProps['onExit']>[0]) => (
    <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={() => onExit(exit)} style={styles.footer} testID={`wellness-footer-${exit}`}>
      <TaskSymbol name={icon} size={19} color={nexdoSecondary} />
      <Text style={[styles.caption2, { color: nexdoSecondary }]}>{title}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.bar, { paddingBottom: 5 + bottom }]} testID="wellness-bottom-bar">
      {footer('Today', 'sun.max', 'home')}
      {footer('Tasks', 'checkmark.circle', 'tasks')}
      <Pressable
        accessibilityLabel="Wellness menu"
        accessibilityRole="button"
        accessibilityState={{ selected: true }}
        onPress={() => undefined}
        style={styles.footer}
        testID="wellness-footer-menu"
      >
        <Image accessible={false} resizeMode="contain" source={WELLNESS_NAVIGATION} style={styles.navigation} />
      </Pressable>
      {footer('Ask AI', 'sparkles', 'askAI')}
      {footer('Calendar', 'calendar', 'calendar')}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  grow: { flex: 1 },
  multiply: { mixBlendMode: 'multiply' },
  quote: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  quoteText: { flex: 1, fontWeight: '500', paddingTop: 10 },
  card: { overflow: 'hidden', borderWidth: 1, justifyContent: 'center' },
  artSlot: { alignItems: 'flex-end', justifyContent: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  tagCapsule: { alignSelf: 'flex-start', borderRadius: 999, overflow: 'hidden' },
  arrow: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.94)' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingTop: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  footer: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4 },
  caption2: { fontSize: 11, lineHeight: 13 },
  navigation: { width: 62, height: 58 },
});
