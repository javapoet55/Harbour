import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FittedText } from '../../components/AskParts';
import { NexdoLogoMark } from '../../components/NexdoLogoMark';
import { withAlpha } from '../../components/SignInBackdrop';
import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { ASK_LANDING_CARDS, ASK_MAX_LENGTH, askIntent } from '../../lib/askIntents';
import { firstName } from '../../store/lastSignedIn';
import { useSession } from '../../store/session';
import { brand, inputText, linearGradientStops, palettes } from '../../theme';
import { swiftColors } from '../wellness/style';
import { useAccessibilityTextSize } from '../wellness/useAccessibilityTextSize';

/**
 * `AskAILandingView` (ios/App/AskAILandingView.swift), what Ask opens on: the Nexdo header and close,
 * the greeting and orb, four briefing cards with the shortened titles, "Ask by Voice", a type-your-
 * request field and "Powered by Nexdo AI". "The dashboard only chooses an entry point; requests retain
 * the assistant's existing consent, review, and execution flow" — every exit is `ask`, `voice` or `close`.
 *
 * FIXED LIGHT, like the Daily Brief it opens: Swift's backdrop fades to `.white` and the field is
 * `.white`, under `nexdoInk`, which is white in dark mode — white on white (§22 "For the team"). The
 * light values are kept in dark mode (android-polish.md, Phase 12 Run A).
 *
 * NOT PORTED: the Shopping and Moments sheets (`destination`, :78-85) and `typing = true` (:110):
 * `select(_:)` reaches them only for cards 5-7, and there are four cards.
 */

const ink = palettes.light.ink;
const secondary = palettes.light.secondary;
const tones = { blue: swiftColors.blue, green: swiftColors.green, orange: swiftColors.orange, purple: swiftColors.purple };
/** `NexdoTheme.gradient`. */
const MIC_GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

/** `pastel(_:)` (:87): the colour at 10% fading to 4.5%, top-leading to bottom-trailing. */
function Pastel({ color, style, children }: { color: string; style: object; children: ReactNode }) {
  return (
    <LinearGradient colors={[withAlpha(color, 0.1), withAlpha(color, 0.045)]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={style}>
      {children}
    </LinearGradient>
  );
}

export function AskLanding({
  prompt,
  onPromptChange,
  busy,
  sendEnabled,
  onAsk,
  onVoice,
  onClose,
  onFocusChange,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  busy: boolean;
  sendEnabled: boolean;
  onAsk: (query: string) => void;
  onVoice: () => void;
  onClose: () => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const large = useAccessibilityTextSize();
  const name = useSession((state) => state.profile?.name ?? '');
  const sendDisabled = !sendEnabled || busy;

  return (
    <LinearGradient
      colors={[withAlpha(swiftColors.cyan, 0.08), withAlpha(swiftColors.purple, 0.06), '#FFFFFF']}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.landing}
      testID="ask-landing"
    >
      <View style={styles.header}>
        <NexdoLogoMark height={42} width={42} />
        <View style={styles.grow}>
          <Text style={[styles.title2, styles.bold, { color: ink }]}>Nexdo</Text>
          <Text style={[styles.caption, { color: secondary }]}>Your AI productivity companion</Text>
        </View>
        <Pressable accessibilityLabel="Close Ask Nexdo" accessibilityRole="button" onPress={onClose} style={styles.close} testID="ask-close">
          <TaskSymbol color={ink} name="xmark" size={20} />
        </Pressable>
      </View>

      <View style={styles.greetingRow}>
        <View style={[styles.grow, styles.greeting]}>
          <Text style={[styles.largeTitle, styles.bold, { color: ink }]}>{`Hi ${firstName(name) ?? 'there'},`}</Text>
          <Text style={[styles.title2, styles.bold, { color: ink }]}>How can I help you today?</Text>
          <Text style={[styles.subheadline, { color: secondary }]}>Plan smarter. Do more. Stress less.</Text>
        </View>
        {large ? null : (
          <View style={styles.orbSlot}>
            <NexdoAIOrb />
          </View>
        )}
      </View>

      <View style={styles.grid}>
        {ASK_LANDING_CARDS.map((card, index) => {
          const tone = tones[card.tone];
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              key={card.intent}
              onPress={() => onAsk(askIntent(card.intent).query)}
              style={[large ? styles.full : styles.half, { opacity: busy ? 0.45 : 1 }]}
              testID={`ask-card-${index}`}
            >
              <Pastel color={tone} style={styles.card}>
                <View style={[styles.cardIcon, { backgroundColor: withAlpha(tone, 0.18) }]}>
                  <TaskSymbol color={tone} name={card.icon} size={20} />
                </View>
                <View style={[styles.grow, styles.cardText]}>
                  <Text style={[large ? styles.headline : styles.cardTitle, { color: ink }]}>{card.title}</Text>
                  {large ? (
                    <Text style={[styles.body, { color: secondary }]}>{card.detail}</Text>
                  ) : (
                    // `.lineLimit(2).minimumScaleFactor(0.85)`: shrunk to keep each line whole, not truncated.
                    <FittedText minimumFontScale={0.85} numberOfLines={2} style={[styles.cardDetail, { color: secondary }]}>
                      {card.detail}
                    </FittedText>
                  )}
                </View>
                <View style={styles.cardChevron}>
                  <TaskSymbol color={secondary} name="chevron.right" size={11} />
                </View>
              </Pastel>
            </Pressable>
          );
        })}
      </View>

      <Pastel color={swiftColors.purple} style={styles.voicePanel}>
        <Pressable
          accessibilityLabel="Ask by Voice"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onVoice}
          style={[styles.voice, { opacity: busy ? 0.45 : 1 }]}
          testID="ask-voice"
        >
          <View style={styles.voiceRow}>
            <Waveform />
            <LinearGradient colors={MIC_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.mic}>
              <TaskSymbol color="#FFFFFF" name="mic.fill" size={30} />
            </LinearGradient>
            <Waveform />
          </View>
          <Text style={[styles.headline, { color: ink }]}>Ask by Voice</Text>
          <Text style={[styles.caption, { color: secondary }]}>Tap and speak naturally. I’m listening…</Text>
        </Pressable>
        <View style={styles.fieldRow}>
          <View style={[styles.keyboard, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.05) }]}>
            <TaskSymbol color={ink} name="keyboard" size={20} />
          </View>
          <TextInput
            accessibilityLabel="Type your request"
            multiline
            onBlur={() => onFocusChange(false)}
            onChangeText={onPromptChange}
            onFocus={() => onFocusChange(true)}
            placeholder="Or type your request…"
            placeholderTextColor={palettes.light.placeholder}
            style={[inputText(styles.subheadline), styles.field, { color: ink }]}
            testID="ask-landing-field"
            value={prompt}
          />
          <Pressable
            accessibilityLabel="Send request"
            accessibilityRole="button"
            accessibilityState={{ disabled: sendDisabled }}
            disabled={sendDisabled}
            onPress={() => {
              onFocusChange(false);
              onAsk(prompt);
            }}
            style={[styles.send, { backgroundColor: withAlpha(brand.nexdoIndigo, sendEnabled ? 1 : 0.45) }]}
            testID="ask-send"
          >
            <TaskSymbol color="#FFFFFF" name="arrow.up" size={20} />
          </Pressable>
        </View>
        {prompt.length > ASK_MAX_LENGTH ? (
          <Text style={[styles.caption, { color: swiftColors.red }]} testID="ask-landing-too-long">
            Keep your request under 4,000 characters.
          </Text>
        ) : null}
      </Pastel>

      <View style={styles.powered}>
        <TaskSymbol color={withAlpha(secondary, 0.65)} name="sparkles" size={12} />
        <Text style={[styles.caption, { color: withAlpha(secondary, 0.65) }]}>Powered by Nexdo AI</Text>
      </View>
    </LinearGradient>
  );
}

/** `waveform` (:103-105): seven indigo capsules, tallest in the middle. Decorative. */
function Waveform() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.waveform}>
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <View key={index} style={[styles.wave, { height: 12 + (3 - Math.abs(3 - index)) * 9 }]} />
      ))}
    </View>
  );
}

/**
 * `NexdoAIOrb` (:123-135): a colour-wheel sphere with a face. The angular gradient and its blur are
 * drawn as a diagonal gradient (no conic gradient without a drawing library).
 */
function NexdoAIOrb() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.orb}>
      <LinearGradient
        colors={[swiftColors.cyan, swiftColors.blue, swiftColors.purple, swiftColors.pink]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.orbFill}
      />
      <View style={styles.orbCore} />
      <View style={styles.orbRing} />
      <View style={styles.face}>
        <View style={styles.eyes}>
          <View style={styles.eye} />
          <View style={styles.eye} />
        </View>
        <View style={styles.smile} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  largeTitle: { fontSize: 34, lineHeight: 41 },
  title2: { fontSize: 22, lineHeight: 28 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  cardTitle: { fontSize: 15, lineHeight: 18, fontWeight: '700' },
  cardDetail: { fontSize: 13, lineHeight: 16 },

  // `VStack(alignment: .leading, spacing: 12)`, at least the viewport tall (AskNexdoView.swift:256).
  // A white base under the translucent gradient: the landing is fixed light (§24) whatever the theme.
  landing: { flexGrow: 1, gap: 12, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.65)' },
  greetingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  greeting: { gap: 5 },
  orbSlot: { width: 94, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Two per row with the 8 gap between: 48.8% + 8 + 48.8% overflowed below ~330 dp of row width (a 360 dp
  // phone), wrapping the grid to one column. 45% leaves room for the gap at any phone width; flexGrow fills it.
  half: { width: '45%', flexGrow: 1 },
  full: { width: '100%' },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, minHeight: 120, borderRadius: 17 },
  cardIcon: { width: 34, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardText: { gap: 5 },
  cardChevron: { paddingTop: 24 },
  voicePanel: { flexGrow: 1, minHeight: 300, padding: 12, gap: 8, borderRadius: 20, justifyContent: 'center' },
  voice: { alignItems: 'center', gap: 8 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mic: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: brand.nexdoIndigo,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wave: { width: 4, borderRadius: 2, backgroundColor: withAlpha(brand.nexdoIndigo, 0.09) },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7, borderRadius: 28, backgroundColor: '#FFFFFF' },
  keyboard: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // `.lineLimit(1...4)` at a 20pt line.
  field: { flex: 1, maxHeight: 88, paddingVertical: 8 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  powered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12 },

  orb: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: swiftColors.purple,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  orbFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 32 },
  orbCore: { position: 'absolute', top: 7, left: 7, right: 7, bottom: 7, borderRadius: 25, backgroundColor: withAlpha(brand.nexdoIndigo, 0.85) },
  orbRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.7)' },
  face: { alignItems: 'center', gap: 5 },
  eyes: { flexDirection: 'row', gap: 19 },
  eye: { width: 7, height: 10, borderRadius: 3.5, backgroundColor: '#FFFFFF' },
  smile: { width: 16, height: 8, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 3, borderTopWidth: 0, borderColor: '#FFFFFF' },
});
