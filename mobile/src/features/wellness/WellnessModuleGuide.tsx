import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCircle } from '../../components/PushedHeader';
import { withAlpha } from '../../components/SignInBackdrop';
import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { useAccessibilityTextSize } from './useAccessibilityTextSize';
import { GUIDE_ART, type WellnessModule } from './art';
import { fixedLightIndigo, nexdoSecondary } from './style';

/**
 * `WellnessModuleGuide` (ios/App/WellnessModuleGuide.swift): "Each module opens with a guide;
 * continuing retains the module's existing navigation." Copy is Swift's, verbatim.
 */

type Guide = {
  title: string;
  subtitle: string;
  color: string;
  steps: [string, string][];
  benefit: { title: string; text: string; icon: keyof typeof Ionicons.glyphMap };
};

/** `Kind` (:5-58). Benefit icons: lightbulb.fill, chart.bar.fill, heart.fill, tag.fill. */
export const GUIDES: Record<WellnessModule, Guide> = {
  calories: {
    title: 'Calorie Tracker',
    subtitle: 'Log your meals, reach your goals, and feel your best.',
    color: '#F04008',
    steps: [
      ['Log your meals', 'Quickly add what you eat by search, scan, or voice. We estimate calories and nutrition for you.'],
      ['Set your goals', 'Choose a goal like maintain, lose, or gain. Personalize your daily calorie and macro targets.'],
      ['Track progress', 'See your daily intake, trends, and insights. Get tips to make healthier choices.'],
    ],
    benefit: { title: 'Small changes add up', text: 'Track consistently, get helpful insights, and build habits that last.', icon: 'bulb' },
  },
  pomodoro: {
    title: 'Pomodoro Focus',
    subtitle: 'Stay focused, get more done, one Pomodoro at a time.',
    color: fixedLightIndigo,
    steps: [
      ['Choose a focus session', 'Start a 25-minute focused work session. Customize the duration to fit your style.'],
      ['Focus without distractions', 'Work on your task while the timer runs. We’ll keep you on track and remind you to stay focused.'],
      ['Take a break and repeat', 'When the timer ends, take a short break. Repeat cycles to build momentum and accomplish more.'],
    ],
    benefit: { title: 'Consistency builds big results', text: 'Short, focused sessions help you get more done with less stress.', icon: 'bar-chart' },
  },
  moments: {
    title: 'Moments',
    subtitle: 'Never miss what matters. We’ll help you remember.',
    color: '#EB0A5C',
    steps: [
      ['Add special moments', 'Save birthdays, anniversaries, festivals, or any occasion that matters to you.'],
      ['Get timely reminders', 'NexDo reminds you ahead of time so you can plan, buy gifts, or prepare a message.'],
      ['Take action easily', 'When it’s time, send a wish, arrange a call to your loved one, or create a greeting card.'],
    ],
    benefit: { title: 'Stronger relationships, happier you', text: 'A small reminder can make someone’s day brighter.', icon: 'heart' },
  },
  shopping: {
    title: 'Shopping List',
    subtitle: 'Plan smarter, shop easier, and save time.',
    color: '#008C45',
    steps: [
      ['Create your list', 'Add items by typing, voice, or from past purchases. You can also explore item suggestions.'],
      ['Plan and organize', 'Group items by category, set a store, and find relevant offers at supported stores.'],
      ['Shop and check off', 'Take your list to the store, check off items as you go, and enjoy a more organized shopping trip.'],
    ],
    benefit: { title: 'Save time. Shop smarter.', text: 'Stay organized, find better deals, and get more done.', icon: 'pricetag' },
  },
};

const INK = '#0A0A30'; // Color(red: 0.04, green: 0.04, blue: 0.19)

export function WellnessModuleGuide({ kind, onContinue, onHome }: { kind: WellnessModule; onContinue: () => void; onHome: () => void }) {
  const insets = useSafeAreaInsets();
  const large = useAccessibilityTextSize();
  const guide = GUIDES[kind];
  const art = GUIDE_ART[kind];
  return (
    <View style={styles.fill} testID={`module-guide-${kind}`}>
      <LinearGradient colors={[withAlpha(guide.color, 0.13), '#FFFFFF', withAlpha(guide.color, 0.05)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* `.navigationTitle("How It Works")`, inline, with the Back button in the module's colour. */}
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={6} onPress={onHome} testID="module-guide-back">
          <GlassCircle scheme="light">
            <TaskSymbol color={guide.color} name="chevron.backward" size={22} />
          </GlassCircle>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.barTitle, { color: INK }]}>
          How It Works
        </Text>
        <View style={styles.barSpacer} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 18 + insets.bottom }]}>
        <View style={styles.header}>
          <Image accessible={false} source={art.header} style={styles.headerArt} />
          <View style={styles.grow}>
            <Text style={[styles.title2, { color: INK }]}>{guide.title}</Text>
            <Text style={[styles.subheadline, { color: nexdoSecondary }]}>{guide.subtitle}</Text>
          </View>
        </View>
        {guide.steps.map(([title, text], index) => (
          <View key={title} style={styles.step} testID={`module-guide-step-${index + 1}`}>
            <View style={[styles.number, { backgroundColor: withAlpha(guide.color, 0.1) }]}>
              <Text style={[styles.title3, { color: guide.color }]}>{String(index + 1)}</Text>
            </View>
            {/* An accessibility text size stacks the picture under the text (`AnyLayout(VStackLayout)`). */}
            <View style={[styles.grow, large ? styles.stepColumn : styles.stepRow]}>
              <View style={[styles.stepText, !large && styles.grow]}>
                <Text style={[styles.subheadlineBold, { color: INK }]}>{title}</Text>
                <Text style={[styles.subheadline, { color: nexdoSecondary }]}>{text}</Text>
              </View>
              <Image accessible={false} source={art.steps[index]} style={large ? styles.stepArtLarge : styles.stepArt} testID={`module-guide-step-art-${index + 1}`} />
            </View>
          </View>
        ))}
        <View style={[styles.benefit, { backgroundColor: withAlpha(guide.color, 0.06) }]}>
          <View accessible={false} style={styles.benefitIcon}>
            <Ionicons color={guide.color} name={guide.benefit.icon} size={26} />
          </View>
          <View style={[styles.grow, styles.benefitText]}>
            <Text style={[styles.subheadlineBold, { color: guide.color }]}>{guide.benefit.title}</Text>
            <Text style={[styles.subheadline, { color: nexdoSecondary }]}>{guide.benefit.text}</Text>
          </View>
        </View>
        <Pressable accessibilityLabel="Got it!" accessibilityRole="button" onPress={onContinue} testID="module-guide-continue">
          <LinearGradient colors={[withAlpha(guide.color, 0.75), guide.color]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
            <Text style={styles.primaryText}>Got it!</Text>
          </LinearGradient>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onHome} style={styles.home} testID="module-guide-home">
          <Text style={[styles.headline, { color: INK }]}>Back to Home</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  grow: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, minHeight: 50 },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  barSpacer: { width: 44 },
  content: { padding: 18, gap: 16, width: '100%', maxWidth: 650, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  headerArt: { width: 76, height: 76, borderRadius: 22 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', marginBottom: 8 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  subheadlineBold: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.94)' },
  number: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepColumn: { gap: 12 },
  stepText: { gap: 8 },
  stepArt: { width: 92, height: 122, borderRadius: 14 },
  stepArtLarge: { width: 150, height: 160, borderRadius: 14 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 18, borderRadius: 22 },
  benefitIcon: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  benefitText: { gap: 6 },
  primary: { minHeight: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  home: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
