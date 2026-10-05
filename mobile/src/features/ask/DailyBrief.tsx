import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';

import { withAlpha } from '../../components/SignInBackdrop';
import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import type { AssistantSection } from '../../lib/assistantPresentation';
import { ASK_MAX_LENGTH, askIntent, type AskIntentId } from '../../lib/askIntents';
import { briefCopy, briefStyle, type BriefArtworkPart, type BriefTone } from '../../lib/dailyBrief';
import { inputText, palettes } from '../../theme';
import { swiftColors } from '../wellness/style';
import { useAccessibilityTextSize } from '../wellness/useAccessibilityTextSize';

/**
 * `DailyBriefView` (ios/App/DailyBriefView.swift): how a briefing intent's answer shows, in place of the
 * plain answer (`showsBriefing`, AskNexdoView.swift:194-199). The supplied artwork, a greeting, the
 * intent's introduction, one card per visible section (each opens its detail page), "Ask anything…"
 * with the mic, and three suggestion chips. Close goes back to the Ask landing, not out of Ask.
 *
 * FIXED LIGHT, as in Swift: an explicit ink and secondary over white cards and a white backdrop.
 */

export const briefInk = '#0A0D38'; // Color(red: 0.04, green: 0.05, blue: 0.22)
export const briefSecondary = '#4D5787'; // Color(red: 0.30, green: 0.34, blue: 0.53)

/** `.pink` and `.indigo` light, beside the other system colours. */
export const briefColors = { ...swiftColors, pink: '#FF2D55', indigo: '#5856D6' };
export const briefTones: Record<BriefTone, string> = { green: briefColors.green, pink: briefColors.pink, blue: briefColors.blue, orange: briefColors.orange };

/** `BriefArtwork` (:174-199): regions of `daily-brief-pack`, cropped into assets/brief. */
const ARTWORK: Record<'logo' | 'robot' | BriefArtworkPart, ImageSourcePropType> = {
  logo: require('../../../assets/brief/brief-logo.png'),
  robot: require('../../../assets/brief/brief-robot.png'),
  priority: require('../../../assets/brief/brief-priority.png'),
  calendar: require('../../../assets/brief/brief-calendar.png'),
  warning: require('../../../assets/brief/brief-warning.png'),
  lightbulb: require('../../../assets/brief/brief-lightbulb.png'),
};

/** `.resizable().scaledToFit().blendMode(.multiply)`: the pack's white ground drops out on the cards. */
export function BriefArtwork({ source, width, height, label }: { source: ImageSourcePropType; width: number; height: number; label?: string }) {
  return (
    <Image
      accessibilityLabel={label}
      accessible={label !== undefined}
      resizeMode="contain"
      source={source}
      style={[styles.multiply as object, { width, height }]}
    />
  );
}

export function DailyBrief({
  intent,
  name,
  sections,
  prompt,
  onPromptChange,
  busy,
  onClose,
  onAsk,
  onVoice,
  onOpenSection,
  onFocusChange,
}: {
  intent: AskIntentId;
  name: string;
  /** Already `visibleBriefSections`. */
  sections: AssistantSection[];
  prompt: string;
  onPromptChange: (value: string) => void;
  busy: boolean;
  onClose: () => void;
  onAsk: (query: string) => void;
  onVoice: () => void;
  onOpenSection: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const large = useAccessibilityTextSize();
  const width = useWindowDimensions().width - 40;
  const copy = briefCopy(intent, name);
  // `ViewThatFits(in: .horizontal)`: the greeting (at least 165) beside the 210-wide robot, or stacked.
  const sideBySide = width >= 165 + 8 + 210;
  const greeting = (
    <View style={styles.greeting}>
      <Text style={[styles.title, styles.bold, { color: briefInk }]}>{`Hi ${name} 👋`}</Text>
      <Text style={[styles.subheadline, { color: briefSecondary }]}>{copy.subtitle}</Text>
    </View>
  );
  const sendable = prompt.trim() !== '';

  return (
    <View style={styles.brief} testID="daily-brief">
      <View style={styles.header}>
        <BriefArtwork height={53} label="Nexdo. Get more done with AI" source={ARTWORK.logo} width={190} />
        <View style={styles.grow} />
        <Pressable
          accessibilityLabel={`Close ${copy.screenTitle}`}
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.close, { backgroundColor: withAlpha(briefColors.blue, 0.09) }]}
          testID="brief-close"
        >
          <TaskSymbol color={briefInk} name="xmark" size={22} />
        </Pressable>
      </View>

      {large ? (
        greeting
      ) : sideBySide ? (
        <View style={styles.greetingRow}>
          <View style={[styles.grow, styles.greetingMin]}>{greeting}</View>
          <BriefArtwork height={110} source={ARTWORK.robot} width={210} />
        </View>
      ) : (
        <View style={styles.greetingStack}>
          {greeting}
          <View style={styles.robotTrailing}>
            <BriefArtwork height={125} source={ARTWORK.robot} width={270} />
          </View>
        </View>
      )}

      <View style={[styles.intro, { backgroundColor: withAlpha(briefColors.purple, 0.07) }]}>
        <View style={[styles.introTile, { backgroundColor: withAlpha(briefColors.purple, 0.09) }]}>
          <TaskSymbol color={briefColors.purple} name="sparkles" size={28} />
        </View>
        <Text style={[styles.subheadline, styles.grow, { color: briefInk }]} testID="brief-introduction">
          {copy.introduction}
        </Text>
      </View>

      {sections.map((section, index) => {
        const style = briefStyle(section.title);
        const tone = briefTones[style.tone];
        return (
          <Pressable
            accessibilityHint={`Opens ${style.title}`}
            accessibilityRole="button"
            key={`${index}-${section.title}`}
            onPress={() => onOpenSection(index)}
            style={styles.sectionCard}
            testID={`brief-section-${index}`}
          >
            <BriefArtwork height={52} source={ARTWORK[style.artwork]} width={52} />
            <View style={[styles.grow, styles.sectionText]}>
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.headline, styles.shrink, { color: briefInk }]}>{style.title}</Text>
                <View style={[styles.count, { backgroundColor: withAlpha(tone, 0.12) }]}>
                  <Text style={[styles.subheadline, styles.bold, { color: tone }]}>{String(section.items.length)}</Text>
                </View>
              </View>
              <Text numberOfLines={2} style={[styles.subheadline, { color: briefSecondary }]}>
                {section.items[0] ?? 'Nothing to report.'}
              </Text>
            </View>
            <TaskSymbol color={briefInk} name="chevron.right" size={12} />
          </Pressable>
        );
      })}
      {sections.length === 0 ? (
        <Text style={[styles.subheadline, { color: briefSecondary }]} testID="brief-empty">
          Nothing needs your attention here right now.
        </Text>
      ) : null}

      <View style={styles.askRow}>
        <View style={[styles.askField, { borderColor: withAlpha(briefColors.blue, 0.16) }]}>
          <TaskSymbol color={briefColors.blue} name="sparkles" size={17} />
          <TextInput
            accessibilityLabel="Ask anything"
            multiline
            onBlur={() => onFocusChange(false)}
            onChangeText={onPromptChange}
            onFocus={() => onFocusChange(true)}
            placeholder="Ask anything…"
            placeholderTextColor={palettes.light.placeholder}
            style={[inputText(styles.body), styles.askInput, { color: briefInk }]}
            testID="brief-field"
            value={prompt}
          />
          {sendable ? (
            <Pressable
              accessibilityLabel="Send request"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || prompt.length > ASK_MAX_LENGTH }}
              disabled={busy || prompt.length > ASK_MAX_LENGTH}
              onPress={() => onAsk(prompt)}
              testID="brief-send"
            >
              <TaskSymbol color={briefColors.blue} name="arrow.up.circle.fill" size={26} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Ask by voice"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onVoice}
          style={{ opacity: busy ? 0.45 : 1 }}
          testID="brief-voice"
        >
          <LinearGradient colors={[briefColors.blue, briefColors.indigo]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.mic}>
            <TaskSymbol color="#FFFFFF" name="mic" size={22} />
          </LinearGradient>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.chips} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
        {(
          [
            ['Summarize my day', 'dailyBriefing'],
            ['Prioritize my tasks', 'topFocusTasks'],
            ['Show conflicts', 'deadlinesAndRisks'],
          ] as const
        ).map(([title, id]) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            key={id}
            onPress={() => onAsk(askIntent(id).query)}
            style={[styles.chip, { backgroundColor: withAlpha(briefColors.indigo, 0.05), borderColor: withAlpha(briefColors.indigo, 0.12), opacity: busy ? 0.45 : 1 }]}
            testID={`brief-suggestion-${id}`}
          >
            <Text style={[styles.caption, { color: briefInk }]}>{title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  bold: { fontWeight: '700' },
  multiply: { mixBlendMode: 'multiply' },
  title: { fontSize: 28, lineHeight: 34 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },

  brief: { gap: 16, paddingTop: 18 },
  header: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  greeting: { gap: 8 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greetingMin: { minWidth: 165 },
  greetingStack: { gap: 8 },
  robotTrailing: { alignItems: 'flex-end' },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: '#FFFFFF' },
  introTile: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sectionCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.9)' },
  sectionText: { gap: 6 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { minWidth: 32, padding: 6, borderRadius: 999, alignItems: 'center' },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  askField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 22, borderWidth: 1, backgroundColor: '#FFFFFF' },
  // `.lineLimit(1...4)`.
  askInput: { flex: 1, maxHeight: 88, padding: 0 },
  mic: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
});
