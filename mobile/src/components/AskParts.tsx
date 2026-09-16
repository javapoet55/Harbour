import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AskIntent } from '../lib/askIntents';
import { brand, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

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
        { backgroundColor: theme.colors.secondaryBackground, borderColor: withAlpha(blue, 0.28), opacity: disabled ? 0.55 : 1 },
      ]}
    >
      <View style={[styles.suggestionIcon, { backgroundColor: withAlpha(blue, 0.16) }]}>
        <TaskSymbol name={intent.icon} size={17} color={theme.colors.ink} />
      </View>
      <View style={styles.grow}>
        <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.ink }]}>{intent.title}</Text>
        <Text style={[styles.caption, { color: theme.colors.secondary }]}>{intent.detail}</Text>
      </View>
      <TaskSymbol name="chevron.right" size={12} color={theme.colors.secondary} />
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
          opacity: disabled ? 0.55 : 1,
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
      <View style={styles.grow}>
        <Text numberOfLines={1} style={[styles.footnote, styles.semibold, { color: theme.colors.ink }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.caption, { color: theme.colors.secondary }]}>
          {detail}
        </Text>
      </View>
    </Pressable>
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
      style={[styles.example, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06), opacity: disabled ? 0.55 : 1 }]}
    >
      <Text style={[styles.subheadline, styles.grow, { color: theme.colors.ink }]}>{example}</Text>
      <TaskSymbol name="arrow.up.left" size={15} color={theme.colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
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

  example: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
});
