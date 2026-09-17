import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { AskIntent } from '../lib/askIntents';
import { brand, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text, type TextProps } from './Text';

/**
 * The pieces of `AskNexdoView` (ios/App/AskNexdoView.swift) that are their own views or funcs:
 * `NexdoAISuggestionCard` (`:58-87`, body `:61`), `entryCards` (`:277-291`), `entryCard(_:detail:
 * icon:voice:action:)` (`:292-310`) and the "Try a prompt" example button (`:220-227`).
 */

/** `NexdoAISuggestionCard` (AskNexdoView.swift:58-87). */
export function AskSuggestionCard({ intent, disabled, onPress }: { intent: AskIntent; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  const blue = theme.colors.askBlue;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${intent.title}. ${intent.detail}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={`ask-intent-${intent.id}`}
      style={[
        styles.suggestion,
        // `.disabled(blocked)` with no `.opacity` of its own, so SwiftUI's own dim alone —
        // about 0.45, from the style map's measured 0.55 -> 0.25 on an explicitly dimmed control.
        { backgroundColor: theme.colors.secondaryBackground, borderColor: withAlpha(blue, 0.28), opacity: disabled ? 0.45 : 1 },
      ]}
    >
      <View style={[styles.suggestionIcon, { backgroundColor: withAlpha(blue, 0.16) }]}>
        {/* `.foregroundStyle(AskStyle.ink)` on the row (`:73`): `.label`, not nexdoInk. */}
        <TaskSymbol name={intent.icon} size={17} color={theme.colors.label} />
      </View>
      <View style={styles.suggestionText}>
        <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.label }]}>{intent.title}</Text>
        {/* `AskStyle.secondary` is `.secondaryLabel` (AskNexdoView.swift:51). */}
        <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>{intent.detail}</Text>
      </View>
      <TaskSymbol name="chevron.right" size={12} color={theme.colors.secondaryLabel} />
    </Pressable>
  );
}

/** `entryCards` (AskNexdoView.swift:277-291): the pinned pair at the bottom of the suggestions page. */
export function AskEntryCards({
  disabled,
  onVoice,
  onText,
}: {
  disabled: boolean;
  onVoice: () => void;
  onText: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.entryOuter, { backgroundColor: theme.colors.background }]}>
      <LinearGradient
        colors={[withAlpha(brand.nexdoMagenta, 0.05), withAlpha(brand.nexdoIndigo, 0.03)]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.entryRow}
      >
        <AskEntryCard title="Ask by Voice" detail="Tap and speak" icon="mic.fill" voice disabled={disabled} onPress={onVoice} testID="ask-entry-voice" />
        <AskEntryCard title="Free form Text" detail="Type your prompt" icon="text.bubble" voice={false} disabled={disabled} onPress={onText} testID="ask-entry-text" />
      </LinearGradient>
    </View>
  );
}

/** `entryCard(_:detail:icon:voice:action:)` (AskNexdoView.swift:292-310). */
export function AskEntryCard({
  title,
  detail,
  icon,
  voice,
  disabled,
  onPress,
  testID,
}: {
  title: string;
  detail: string;
  icon: 'mic.fill' | 'text.bubble';
  voice: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        styles.entryCard,
        {
          backgroundColor: voice ? withAlpha(brand.nexdoIndigo, 0.05) : theme.colors.background,
          borderColor: withAlpha(brand.nexdoIndigo, 0.14),
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      {voice ? (
        <LinearGradient
          colors={[brand.nexdoIndigo, brand.nexdoBlue]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.entryIcon}
        >
          <TaskSymbol name={icon} size={22} color="#FFFFFF" />
        </LinearGradient>
      ) : (
        <View style={[styles.entryIcon, { backgroundColor: withAlpha(brand.nexdoMagenta, 0.08) }]}>
          <TaskSymbol name={icon} size={22} color={brand.nexdoIndigo} />
        </View>
      )}
      <View style={styles.entryText}>
        {/* `.lineLimit(1).minimumScaleFactor(0.75)` on BOTH labels (AskNexdoView.swift:301-302).
            The test phone's screen is 18 dp narrower than the iPhone's, which is enough on its own
            to run "Free form Text" and "Type your prompt" out of room. (Not the typeface: at font
            scale 1.0 Roboto is within 1% of SF Pro — style map §2.) */}
        <FittedText style={[styles.footnote, styles.semibold, { color: theme.colors.ink }]}>{title}</FittedText>
        <FittedText style={[styles.caption, { color: theme.colors.secondaryLabel }]}>{detail}</FittedText>
      </View>
    </Pressable>
  );
}

/**
 * One line that shrinks to fit, on both platforms: SwiftUI's `.lineLimit(1).minimumScaleFactor(_:)`.
 *
 * `adjustsFontSizeToFit` is iOS-only in React Native — see docs/swift-to-rn-style-map.md,
 * "`.minimumScaleFactor` has no Android equivalent". On Android it is silently ignored and the
 * label keeps its size, so the run is clipped with no ellipsis: "Type your prompt" painted as
 * "Type your" while `uiautomator` still reported the whole string.
 *
 * iOS keeps the real thing. Android measures instead: a copy of the label is laid out at full size
 * inside an over-wide absolute layer, where it is a shrink-to-fit child and so reports its *own*
 * content width through `onLayout` — the ink width, not the container width that `onTextLayout`
 * hands back (style map §4). The row reports the width available, and the font is scaled by the
 * ratio, clamped at `minimumFontScale` exactly as SwiftUI clamps at its scale factor.
 *
 * `lineHeight` is left alone so the shrunk label keeps its box and the card does not change height.
 */
export function FittedText({
  minimumFontScale = 0.75,
  style,
  children,
}: {
  minimumFontScale?: number;
  style: TextProps['style'];
  children: string;
}) {
  const [available, setAvailable] = useState(0);
  const [natural, setNatural] = useState(0);
  const measures = Platform.OS === 'android';

  const width = (set: (value: number) => void) => (event: LayoutChangeEvent) => set(event.nativeEvent.layout.width);
  const base = StyleSheet.flatten(style);
  const fontSize = typeof base?.fontSize === 'number' ? base.fontSize : undefined;
  const scale = measures && available > 0 && natural > available ? Math.max(minimumFontScale, available / natural) : 1;

  return (
    <View onLayout={measures ? width(setAvailable) : undefined}>
      <Text
        numberOfLines={1}
        // Right on iOS, and a no-op on Android, where `scale` is what actually fits the label.
        adjustsFontSizeToFit
        minimumFontScale={minimumFontScale}
        style={[style, scale < 1 && fontSize !== undefined && { fontSize: fontSize * scale }]}
      >
        {children}
      </Text>
      {measures ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.measureLayer}
        >
          <Text onLayout={width(setNatural)} style={[style, styles.measured]}>
            {children}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** One "Try a prompt" row (AskNexdoView.swift:220-227). Fills the composer; it does not send. */
export function AskExampleRow({ example, disabled, onPress }: { example: string; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={example}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={`ask-example-${example}`}
      style={[styles.example, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06), opacity: disabled ? 0.45 : 1 }]}
    >
      {/* The row carries no `.font` and no `.foregroundStyle` (AskNexdoView.swift:221-225), so both
          children are `.body` in `Color.primary`. */}
      <Text style={[theme.typography.body, styles.grow, { color: theme.colors.label }]}>{example}</Text>
      <TaskSymbol name="arrow.up.left" size={17} color={theme.colors.label} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  // Named text styles carry their own leading (style map section 2).
  subheadline: { fontSize: 15, lineHeight: 21 },
  footnote: { fontSize: 13, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },

  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    minHeight: 62,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // `VStack(alignment: .leading, spacing: 3)` (AskNexdoView.swift:69).
  suggestionText: { flex: 1, gap: 3 },

  entryOuter: { paddingHorizontal: 16, paddingVertical: 14 },
  entryRow: { flexDirection: 'row', gap: 12, padding: 16 },
  entryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    minHeight: 76,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  entryIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // `VStack(alignment: .leading, spacing: 4)` (AskNexdoView.swift:300).
  entryText: { flex: 1, gap: 4 },

  // A bare `HStack` spaces its children by 8 (AskNexdoView.swift:222).
  example: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 16 },

  // Absolute, so it neither sizes its parent nor paints over the label it is measuring; wide
  // enough that the copy inside it is never the one deciding where the line breaks.
  measureLayer: { position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 },
  measured: { alignSelf: 'flex-start' },
});
