import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Image, type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientText } from '../../components/GradientText';
import { Text } from '../../components/Text';
import { introduction as colors, textStyles } from '../../theme';
import { FixedLightStatusBar } from '../wellness/FixedLightStatusBar';

/**
 * `InstallIntroductionView` (ios/App/InstallIntroductionView.swift, 35b40f2 / 530f1bd): four pages before
 * sign-in on a first install. Skip and Get Started finish with sign-up; "Already have an account? Sign In"
 * finishes without it. Always light, like Swift's `.preferredColorScheme(.light)`.
 *
 * The artwork is the illustration region Swift crops at runtime (`artwork(_:)`, `features`), pre-cropped
 * into `assets/introduction/` (§24 Native requirements): about 0.5 MB in place of 7.9 MB.
 */

export const INTRODUCTION_PAGES = [
  {
    heading: 'Less on your mind.',
    accent: 'More done in your day.',
    description: 'Your AI-powered daily assistant that brings your tasks, calendar, and everyday life together.',
    artwork: require('../../../assets/introduction/page-1.jpg') as ImageSourcePropType,
    aspect: 784 / 1135,
    artworkLabel: 'NexDo brings tasks, calendar, shopping and moments into one place.',
  },
  {
    heading: 'Just Ask.',
    accent: 'NexDo Takes Action.',
    description: 'Speak naturally to create tasks, plan your day, find answers, and get things done — with less effort.',
    artwork: require('../../../assets/introduction/page-2.jpg') as ImageSourcePropType,
    aspect: 784 / 1265,
    artworkLabel: 'Example: ask to call the dentist tomorrow at 9 AM, or find nearby grocery stores for your shopping list.',
  },
  {
    heading: 'One App.',
    accent: 'So Many Ways to\nMake Life Easier.',
    description: 'Plan smarter, shop easier, stay focused, and never miss the moments that matter.',
    artwork: require('../../../assets/introduction/page-3.jpg') as ImageSourcePropType,
    aspect: 784 / 565,
    artworkLabel: 'Your tasks and schedule together in My Day.',
  },
  {
    heading: 'More Time for',
    accent: 'What Matters.',
    description: 'Stay organized, accomplish more, and enjoy life’s special moments with NexDo.',
    artwork: require('../../../assets/introduction/page-4.jpg') as ImageSourcePropType,
    aspect: 784 / 1030,
    artworkLabel: 'More time to relax. Shop smarter, stay organized, focus better and capture moments.',
  },
] as const;

/** `features` (:117-133): the 2×2 grid on page 3, each cut from `first-launch-5`. */
const FEATURES = [
  { title: 'Smart To-Do’s', detail: 'Capture, organize and get things done with AI.', icon: require('../../../assets/introduction/feature-todos.png') as ImageSourcePropType, aspect: 110 / 100 },
  { title: 'Calendar & Reminders', detail: 'Keep your schedule in sync and never miss a thing.', icon: require('../../../assets/introduction/feature-calendar.png') as ImageSourcePropType, aspect: 112 / 100 },
  { title: 'Shopping Lists', detail: 'Plan, organize and even send to nearby stores.', icon: require('../../../assets/introduction/feature-shopping.png') as ImageSourcePropType, aspect: 110 / 108 },
  { title: 'Everyday Essentials', detail: 'Stay focused, track meals, capture moments and more.', icon: require('../../../assets/introduction/feature-essentials.png') as ImageSourcePropType, aspect: 112 / 108 },
] as const;

const GRADIENT = [colors.blue, colors.purple] as const;
const LAST = INTRODUCTION_PAGES.length - 1;
/** `GridItem(.adaptive(minimum: 145), spacing: 10)` inside `.padding(.horizontal, 20)`. */
const FEATURE_MIN = 145;
const FEATURE_GAP = 10;

export function InstallIntroduction({ onFinish }: { onFinish: (signUp: boolean) => void }) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  // `select(_:)`: animated unless Reduce Motion is on.
  const select = (index: number) => {
    setPage(index);
    pager.current?.scrollTo({ x: index * width, animated: !reduceMotion });
  };
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1)));

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.fill} testID="install-introduction">
      <FixedLightStatusBar />
      <View style={styles.skipRow}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onFinish(true)} style={styles.skip} testID="intro.skip">
          <Text style={[textStyles.body, styles.medium, { color: colors.blue }]}>Skip</Text>
        </Pressable>
      </View>

      {/* `TabView(selection:).tabViewStyle(.page(indexDisplayMode: .never))`; each page scrolls on its own. */}
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settle}
        style={styles.fill}
        testID="intro.pager"
      >
        {INTRODUCTION_PAGES.map((item, index) => (
          <ScrollView key={item.heading} style={{ width }} contentContainerStyle={styles.page} testID={`intro.page.${index + 1}`}>
            {index === 0 ? (
              <View accessible accessibilityLabel="NexDo" style={styles.brandRow}>
                {/* SF `sparkle` is one four-point star; Ionicons only has the three-star `sparkles`. */}
                <Text style={[styles.largeTitle, { color: colors.blue }]}>✦</Text>
                <Text style={[styles.largeTitle, { color: colors.ink }]}>NexDo</Text>
              </View>
            ) : null}
            <View accessibilityRole="header" accessible accessibilityLabel={`${item.heading} ${item.accent.replace('\n', ' ')}`} style={styles.headings}>
              <Text style={[styles.largeTitle, styles.centered, { color: colors.ink }]}>{item.heading}</Text>
              {item.accent.split('\n').map((line) => (
                <GradientText colors={GRADIENT} key={line} style={[styles.largeTitle, styles.centered]}>
                  {line}
                </GradientText>
              ))}
            </View>
            <Text style={[textStyles.title3, styles.centered, styles.description, { color: colors.body }]}>{item.description}</Text>
            {index === 2 ? <Features width={width} /> : null}
            <Image accessibilityLabel={item.artworkLabel} accessible resizeMode="cover" source={item.artwork} style={{ width, aspectRatio: item.aspect }} testID={`intro.artwork.${index + 1}`} />
          </ScrollView>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {page === LAST ? (
          <>
            <Pressable accessibilityLabel="Get Started" accessibilityRole="button" onPress={() => onFinish(true)} testID="intro.getStarted">
              <LinearGradient colors={GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.getStarted}>
                <Text style={[styles.getStartedText]}>Get Started</Text>
                <Ionicons color="#FFFFFF" name="arrow-forward" size={22} />
              </LinearGradient>
            </Pressable>
            <Pressable accessibilityLabel="Already have an account? Sign In" accessibilityRole="button" onPress={() => onFinish(false)} style={styles.signIn} testID="intro.signIn">
              <Text style={[textStyles.body, { color: colors.secondary }]}>
                Already have an account? <Text style={[textStyles.body, styles.underline, { color: colors.blue }]}>Sign In</Text>
              </Text>
            </Pressable>
          </>
        ) : null}
        <View style={styles.dotsRow}>
          {page < LAST ? <View style={styles.sideSlot} /> : null}
          <View style={styles.spacer} />
          <View style={styles.dots}>
            {INTRODUCTION_PAGES.map((item, index) => (
              <Pressable
                accessibilityLabel={`Page ${index + 1} of 4`}
                accessibilityRole="button"
                accessibilityState={{ selected: index === page }}
                key={item.heading}
                onPress={() => select(index)}
                style={styles.dotTarget}
                testID={`intro.dot.${index + 1}`}
              >
                <View style={[styles.dot, { backgroundColor: index === page ? colors.blue : colors.dot }]} />
              </Pressable>
            ))}
          </View>
          <View style={styles.spacer} />
          {page < LAST ? (
            <Pressable accessibilityLabel="Next" accessibilityRole="button" onPress={() => select(page + 1)} style={[styles.sideSlot, styles.next]} testID="intro.next">
              <Text style={[styles.headline, { color: colors.blue }]}>Next</Text>
              <Ionicons color={colors.blue} name="arrow-forward" size={20} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Features({ width }: { width: number }) {
  const available = width - 40;
  const columns = Math.max(1, Math.floor((available + FEATURE_GAP) / (FEATURE_MIN + FEATURE_GAP)));
  const cardWidth = (available - FEATURE_GAP * (columns - 1)) / columns;
  return (
    <View style={styles.features} testID="intro.features">
      {FEATURES.map((feature, index) => (
        <View key={feature.title} style={[styles.feature, { width: cardWidth, backgroundColor: colors.featureFills[index] }]}>
          <Image accessible={false} resizeMode="contain" source={feature.icon} style={{ width: 85, aspectRatio: feature.aspect }} />
          <Text style={[styles.headline, styles.centered, { color: colors.ink }]}>{feature.title}</Text>
          <Text style={[textStyles.subheadline, styles.centered, { color: colors.secondary }]}>{feature.detail}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  // `.padding(.horizontal, 24).frame(minHeight: 44)`
  skip: { minHeight: 44, paddingHorizontal: 24, justifyContent: 'center' },
  medium: { fontWeight: '500' },
  // `VStack(spacing: 18).padding(.top, 8)`
  page: { alignItems: 'center', gap: 18, paddingTop: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  largeTitle: { ...textStyles.largeTitle, fontWeight: '700' },
  // `VStack(spacing: 3)` with `.padding(.horizontal, 16)`
  headings: { alignItems: 'center', gap: 3, paddingHorizontal: 16 },
  centered: { textAlign: 'center' },
  description: { paddingHorizontal: 28 },
  features: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: FEATURE_GAP, paddingHorizontal: 20, alignSelf: 'stretch' },
  feature: { alignItems: 'center', gap: 8, padding: 12, borderRadius: 24 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  // `VStack(spacing: 12).padding(.horizontal, 24).padding(.vertical, 8)`
  footer: { gap: 12, paddingHorizontal: 24, paddingVertical: 8, backgroundColor: colors.background },
  // `.font(.title3.bold()).padding(18)` in a capsule
  getStarted: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18, borderRadius: 999 },
  getStartedText: { ...textStyles.title3, fontWeight: '700', color: '#FFFFFF' },
  signIn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  dotsRow: { flexDirection: 'row', alignItems: 'center' },
  sideSlot: { width: 80 },
  spacer: { flex: 1 },
  dots: { flexDirection: 'row', gap: 12 },
  // `.frame(width: 10, height: 10).frame(width: 32, height: 44)`
  dotTarget: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minHeight: 44 },
});
