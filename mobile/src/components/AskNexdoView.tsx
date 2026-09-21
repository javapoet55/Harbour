import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ASK_INTENTS, ASK_MAX_LENGTH, ASK_TEXT_EXAMPLES } from '../lib/askIntents';
import { blockedTurn, policyGuardRefusal } from '../lib/assistantPolicy';
import { spokenText } from '../lib/assistantPresentation';
import { SHOPPING_PROMPTS, shoppingPromptIcon, shoppingSubmission, type ShoppingRecommendationContext } from '../lib/shoppingRecommendations';
import { speechChunks } from '../lib/speechText';
import { useAsk } from '../query/useAssistant';
import { useAssistantStore } from '../store/assistant';
import { useConsent } from '../store/consent';
import { brand, linearGradientStops, useTheme } from '../theme';
import { playSpeech, type SpeechPlayback } from '../voice/speech';
import { AskEntryCards, AskExampleRow, AskSuggestionCard } from './AskParts';
import { AskResponse } from './AskResponse';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * `AskNexdoView` (ios/App/AskNexdoView.swift:89-446). `body` is **AskNexdoView.swift:182-277**, read
 * top to bottom; the children it renders are `NexdoAISuggestionCard` (`:58`, in `AskParts.tsx`),
 * `AskResponseView` (ios/App/AskResponseView.swift:4, in `AskResponse.tsx`), and the private
 * `entryCards` / `entryCard` / `composer` / `field` / `controls` / `consentView` (`:277-375`).
 *
 * ONE view, three presentations, exactly as in Swift's `init(initialPrompt:startWithVoice:textPage:)`:
 *
 * - `textPage: false` — the suggestions page. Five `NexdoAIIntent` cards, and the "Ask by Voice" /
 *   "Free form Text" pair pinned to the bottom. No composer.
 * - `textPage: true` — "Free form Text". A composer instead of the suggestion cards, three example
 *   prompts, and a bottom composer once there is an answer.
 * - either, with an `initialPrompt` — the composer starts filled but nothing is sent.
 *
 * There is NO message list. Swift shows one `model.turn` at a time and "Show suggestions" (`:246`)
 * throws it away, so `useAssistantStore` holds exactly one turn.
 *
 * - `textPage: true` with a `shoppingContext` — Shopping Recommendations (global pattern 16), opened
 *   from Shopping Detail's AI Powered Recommendations as a `.sheet` (ShoppingViews.swift:299): its own
 *   title (`:195`), an intro card instead of the heading (`:325-344`), four shopping prompts with icons
 *   (`:309-323`), "Ask about this shopping list…" and "Get Recommendations" (`:402`, `:415-418`), the
 *   list sent ahead of the question (`:469-473`), and no bottom composer after an answer (`:263`).
 *
 * NOT PORTED: `startWithVoice`, because no call site in the Swift app passes it (the only three are
 * RootView.swift:113, RootView.swift:19-21 behind DEBUG launch arguments, and CalendarView.swift:158).
 */
export type AskNexdoViewProps = {
  textPage: boolean;
  initialPrompt?: string;
  shoppingContext?: ShoppingRecommendationContext;
  /** Set when the view is presented as a sheet by its caller rather than as an `app/ask` route. */
  onClose?: () => void;
};

/** `NexdoTheme.gradient`: magenta → indigo → blue, leading to trailing. */
const INTRO_TILE = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

export function AskNexdoView({ textPage, initialPrompt = '', shoppingContext, onClose }: AskNexdoViewProps) {
  // The suggestions page is a `.sheet` (RootView.swift:110), and iOS resolves `AskStyle.background`
  // and `AskStyle.cardBackground` one level up inside one — #1C1C1E in dark mode, not black.
  // "Free form Text" is a `.fullScreenCover` (AskNexdoView.swift:271), which does NOT elevate; Shopping
  // Recommendations is a `.sheet` again (`shopping-ai-recommendations-sheet-dark`).
  // `app/ask/_layout.tsx` sets the matching `contentStyle` on `index` only.
  const presentedAsSheet = onClose !== undefined;
  const theme = useTheme({ elevated: !textPage || presentedAsSheet });
  // `consentView` is always presented as a sheet (`:266`), whichever page opened it.
  const sheetTheme = useTheme({ elevated: true });
  const consent = useConsent();
  const ask = useAsk();

  const turn = useAssistantStore((state) => state.turn);
  const lastAssistantPrompt = useAssistantStore((state) => state.lastAssistantPrompt);

  const [prompt, setPrompt] = useState(initialPrompt);
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [preparingSpeech, setPreparingSpeech] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [readingSection, setReadingSection] = useState<number | null>(null);
  const [lastSpeechText, setLastSpeechText] = useState<string | null>(null);
  const [lastRequestWasVoice, setLastRequestWasVoice] = useState(false);
  const speech = useRef<SpeechPlayback | null>(null);

  const submitting = ask.isPending;
  // `blocked` (AskNexdoView.swift:148). Swift also ORs in `model.busy`, the app-wide "Updating…"
  // flag; React Query has no single global equivalent, so this is the Ask request alone.
  const blocked = submitting;
  const validPrompt = prompt.trim().length > 0 && prompt.length <= ASK_MAX_LENGTH;
  const blue = theme.colors.askBlue;

  /** `stopSpeech()` (AskNexdoView.swift:411-416). */
  const stopSpeech = () => {
    speech.current?.stop();
    speech.current = null;
    setPreparingSpeech(false);
    setPlaying(false);
    setReadingSection(null);
  };

  // `.onDisappear { if !showingVoice { requestTask?.cancel(); stopSpeech() } }` (AskNexdoView.swift:274).
  useEffect(() => () => speech.current?.stop(), []);

  /** `speakAnswer(text:section:)` (AskNexdoView.swift:420-426) and `speakChunks` (`:428-445`). */
  const speakAnswer = (text?: string, section: number | null = null) => {
    if (!consent.ai) {
      setVoiceError('Allow OpenAI sharing in Account to use Read Loud.');
      return;
    }
    const body = text ?? (turn ? spokenText(turn) : '');
    if (body.length === 0) return;

    stopSpeech();
    setVoiceError(null);
    setLastSpeechText(body);
    setReadingSection(section);
    // `speakChunks(_:index:)` (AskNexdoView.swift:428-445): one /api/speech request per chunk, played
    // in order, and a failure becomes "Your answer is ready to read. " + the message (`:443`).
    speech.current = playSpeech(speechChunks(body), {
      onPreparing: setPreparingSpeech,
      onPlaying: setPlaying,
      onFinished: () => setReadingSection(null),
      onError: (message) => {
        setPreparingSpeech(false);
        setReadingSection(null);
        setVoiceError(`Your answer is ready to read. ${message}`);
      },
    });
  };

  /** `request(_:speakResponse:)` (AskNexdoView.swift:377-409). */
  const request = (text: string, speakResponse = false) => {
    if (blocked) return;
    const query = text.trim();
    if (query.length === 0 || query.length > ASK_MAX_LENGTH) return;

    // The policy guard runs BEFORE the consent gate and before any network call.
    if (policyGuardRefusal(query) !== null) {
      useAssistantStore.getState().setTurn(blockedTurn(query), query);
      setFailedQuery(null);
      if (prompt.trim() === query) setPrompt('');
      return;
    }

    if (!consent.ai) {
      setPendingQuery(query);
      setShowConsent(true);
      return;
    }

    stopSpeech();
    setVoiceError(null);
    setLastRequestWasVoice(speakResponse);
    setFailedQuery(null);
    ask.mutate(
      { text: submission(query) },
      {
        onSuccess: () => {
          showAsAsked(query);
          if (prompt.trim() === query) setPrompt('');
          if (speakResponse) speakAnswer();
        },
        onError: () => setFailedQuery(query),
      },
    );
  };

  /** `shoppingContext.map { $0.assistantContext + "\n\nCustomer request: " + query } ?? query` (:469). */
  const submission = (query: string) => (shoppingContext ? shoppingSubmission(shoppingContext, query) : query);

  /** `if shoppingContext != nil { model.lastAssistantPrompt = query }` (:472): show the words typed. */
  const showAsAsked = (query: string) => {
    if (shoppingContext) useAssistantStore.setState({ lastAssistantPrompt: query });
  };

  /**
   * "Allow sharing with OpenAI" re-runs the pending query (AskNexdoView.swift:355-360). `consent.ai`
   * is still `false` in this render's closure, so the guard inside `request` would bounce it straight
   * back to the sheet; this is the same call with the gate already satisfied.
   */
  function requestAfterConsent(query: string) {
    stopSpeech();
    setVoiceError(null);
    setLastRequestWasVoice(false);
    setFailedQuery(null);
    ask.mutate(
      { text: submission(query) },
      {
        onSuccess: () => {
          showAsAsked(query);
          if (prompt.trim() === query) setPrompt('');
        },
        onError: () => setFailedQuery(query),
      },
    );
  }

  /** The close button (AskNexdoView.swift:188-205). */
  const close = () => {
    stopSpeech();
    setFailedQuery(null);
    setPendingQuery(null);
    useAssistantStore.getState().clearTurn();
    if (onClose) onClose();
    else router.back();
  };

  const field = (
    <TextInput
      accessibilityLabel="Ask Nexdo follow-up"
      multiline
      onChangeText={setPrompt}
      placeholder={shoppingContext ? 'Ask about this shopping list…' : 'Type your prompt…'}
      placeholderTextColor={theme.colors.placeholder}
      style={[
        styles.field,
        // `.lineLimit(textPage && model.turn == nil ? 4...8 : 1...4)` at a 21pt `.subheadline` line
        // box plus the 12pt padding either side. The 1-line floor is Swift's own
        // `.frame(minHeight: 44)` (AskNexdoView.swift:339), which is taller than one line.
        textPage && turn === null ? { minHeight: 108, maxHeight: 192 } : { minHeight: 44, maxHeight: 108 },
        { color: theme.colors.ink, backgroundColor: theme.colors.secondaryBackground, borderColor: theme.colors.separator },
      ]}
      testID="ask-field"
      value={prompt}
    />
  );

  const controls = (
    <View style={styles.controls}>
      <Pressable
        accessibilityLabel={shoppingContext ? 'Get shopping recommendations' : 'Ask Nexdo'}
        accessibilityRole="button"
        accessibilityState={{ disabled: !validPrompt || blocked }}
        disabled={!validPrompt || blocked}
        onPress={() => request(prompt)}
        // Swift writes `.disabled(...)` AND `.opacity(0.55)` (`:365`); SwiftUI dims a disabled
        // control on top of that, and the rendered result matches 0.25 (style map section 5).
        style={[styles.askButton, { backgroundColor: blue, opacity: validPrompt && !blocked ? 1 : 0.25 }]}
        testID="ask-submit"
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={[styles.subheadline, styles.semibold, { color: '#FFFFFF' }]}>{shoppingContext ? 'Get Recommendations' : 'Ask Nexdo'}</Text>
        )}
      </Pressable>
      {!textPage ? (
        <Pressable
          accessibilityHint="Record a question or create a task with OpenAI voice"
          accessibilityLabel="Start voice input"
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={() => {
            stopSpeech();
            router.push('/ask/voice');
          }}
          style={[styles.micButton, { backgroundColor: blue }]}
          testID="ask-mic"
        >
          {/* `Image(systemName:)` with no `.font` is `.body` (AskNexdoView.swift:370). */}
          <TaskSymbol name={playing ? 'speaker.wave.2.fill' : 'mic'} size={17} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );

  /** `composer` (AskNexdoView.swift:312-333). */
  const composer = (
    <View style={[styles.composer, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />

      {preparingSpeech ? (
        <View style={styles.speechRow}>
          <ActivityIndicator color={blue} size="small" />
          {/* Neither the ProgressView label nor the Button carries a `.font` (`:314`), so both
              are `.body`. The same is true of every control in this block. */}
          <Text style={[theme.typography.body, styles.grow, { color: theme.colors.label }]}>Preparing voice reply…</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={stopSpeech} testID="ask-speech-cancel">
            <Text style={[theme.typography.body, { color: blue }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {playing ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Stop speaking" onPress={stopSpeech} style={styles.speechRow} testID="ask-speech-stop">
          <TaskSymbol name="stop.circle" size={17} color={blue} />
          <Text style={[theme.typography.body, { color: blue }]}>Stop speaking</Text>
        </Pressable>
      ) : null}

      {voiceError !== null ? (
        <View style={styles.speechError}>
          {/* `Text(message).font(.caption)` with no `.foregroundStyle` (`:319`) is `Color.primary`. */}
          <Text style={[styles.caption, { color: theme.colors.label }]} testID="ask-voice-error">
            {voiceError}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry voice reply"
            accessibilityState={{ disabled: blocked || preparingSpeech }}
            disabled={blocked || preparingSpeech}
            onPress={() => speakAnswer(lastSpeechText ?? undefined)}
            testID="ask-speech-retry"
          >
            {/* `.disabled(...)` with no `.opacity` of its own: SwiftUI's own dim alone, which the
                style map's 0.55 -> 0.25 measurement puts at about 0.45. */}
            <Text style={[theme.typography.body, { color: blue, opacity: blocked || preparingSpeech ? 0.45 : 1 }]}>Retry voice reply</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composerRow}>
        <View style={styles.grow}>{field}</View>
        {controls}
      </View>

      {prompt.length > ASK_MAX_LENGTH ? (
        <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]} testID="ask-too-long">
          Keep your question under 4,000 characters.
        </Text>
      ) : null}
    </View>
  );

  return (
    // A sheet's top edge sits below the status bar already, so only a route needs the top inset.
    <SafeAreaView edges={presentedAsSheet ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {/* Header (AskNexdoView.swift:184-208). */}
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title2, styles.bold, styles.grow, { color: theme.colors.ink }]}>
          {shoppingContext ? 'Shopping Recommendations' : textPage ? 'Free form Text' : 'Ask Nexdo'}
        </Text>
        <Pressable
          accessibilityHint="Closes Ask Nexdo"
          accessibilityLabel="Close Ask Nexdo"
          accessibilityRole="button"
          onPress={close}
          style={[styles.close, { backgroundColor: withAlpha(brand.nexdoBlue, 0.12), borderColor: withAlpha(brand.nexdoBlue, 0.22) }]}
          testID="ask-close"
        >
          <TaskSymbol name="xmark" size={22} color={brand.nexdoBlue} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
        {turn === null ? (
          <>
            {/* `AskStyle.secondary` is `Color(uiColor: .secondaryLabel)` (`:51`), not nexdoSecondary. */}
            {shoppingContext ? null : (
              <Text style={[styles.subheadline, styles.tagline, { color: theme.colors.secondaryLabel }]}>Let’s make room for what matters.</Text>
            )}

            {textPage ? (
              <>
                {shoppingContext ? (
                  <ShoppingIntro context={shoppingContext} />
                ) : (
                  <>
                    {/* No `.foregroundStyle` in Swift (`:217`), so `Color.primary` — `.label`, not nexdoInk. */}
                    <Text style={[styles.title2, styles.bold, { color: theme.colors.label }]}>What would you like help with?</Text>
                    <Text style={[styles.subheadline, { color: theme.colors.secondaryLabel }]}>
                      Type a question or tell Nexdo what to plan, create, or change.
                    </Text>
                  </>
                )}
                {field}
                <View style={styles.controlsRow}>{controls}</View>
                <Text style={[styles.headline, styles.tryHeading, { color: theme.colors.ink }]}>{shoppingContext ? 'Try asking about your list' : 'Try a prompt'}</Text>
                {(shoppingContext ? SHOPPING_PROMPTS : ASK_TEXT_EXAMPLES).map((example) => (
                  <AskExampleRow
                    key={example}
                    example={example}
                    disabled={blocked}
                    icon={shoppingContext ? shoppingPromptIcon(example) : undefined}
                    onPress={() => setPrompt(example)}
                  />
                ))}
              </>
            ) : (
              ASK_INTENTS.map((intent) => (
                <AskSuggestionCard key={intent.id} intent={intent} disabled={blocked} onPress={() => request(intent.query)} />
              ))
            )}
          </>
        ) : (
          <>
            {lastAssistantPrompt !== null ? (
              <View accessibilityLabel={`Your question: ${lastAssistantPrompt}`} style={styles.questionRow}>
                <TaskSymbol name="questionmark.circle" size={15} color={theme.colors.secondaryLabel} />
                <Text numberOfLines={2} style={[styles.subheadline, styles.grow, { color: theme.colors.secondaryLabel }]} testID="ask-last-prompt">
                  {lastAssistantPrompt}
                </Text>
              </View>
            ) : null}

            <AskResponse
              busy={blocked}
              onApprove={() => ask.mutate({ text: 'yes', accept: true })}
              onReadLoud={(index, text) => (readingSection === index ? stopSpeech() : speakAnswer(text, index))}
              onReject={() => ask.mutate({ text: 'no', accept: false })}
              preparingSpeech={preparingSpeech}
              readingSection={readingSection}
              turn={turn}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show suggestions"
              accessibilityState={{ disabled: blocked }}
              disabled={blocked}
              onPress={() => {
                stopSpeech();
                useAssistantStore.getState().clearTurn();
              }}
              style={styles.showSuggestions}
              testID="ask-show-suggestions"
            >
              <Text style={[theme.typography.body, { color: blue }]}>Show suggestions</Text>
            </Pressable>
          </>
        )}

        {submitting ? (
          // `ProgressView("Asking Nexdo…")` (`:250`) puts its label under the spinner.
          <View style={styles.progress}>
            <ActivityIndicator color={blue} size="small" />
            <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondaryLabel }]} testID="ask-submitting">
              Asking Nexdo…
            </Text>
          </View>
        ) : null}

        {failedQuery !== null ? (
          <View style={styles.failure}>
            {/* `.font(.subheadline)` on the VStack, no `.foregroundStyle` (`:252-256`). */}
            <Text style={[styles.subheadline, { color: theme.colors.label }]} testID="ask-failed">
              Nexdo couldn’t complete that request. Please try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry"
              accessibilityState={{ disabled: blocked }}
              disabled={blocked}
              onPress={() => request(failedQuery, lastRequestWasVoice)}
              testID="ask-retry"
            >
              <Text style={[styles.subheadline, { color: blue, opacity: blocked ? 0.45 : 1 }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* `.safeAreaInset(edge: .bottom)` (AskNexdoView.swift:264). */}
      {/* `if model.turn != nil && shoppingContext == nil { composer }` (:263). */}
      {textPage ? (turn !== null && !shoppingContext ? composer : null) : (
        <AskEntryCards
          disabled={blocked}
          onText={() => {
            stopSpeech();
            router.push('/ask/text');
          }}
          onVoice={() => {
            stopSpeech();
            router.push('/ask/voice');
          }}
        />
      )}

      {/* `consentView` in a `.sheet` with `[.medium, .large]` detents (AskNexdoView.swift:266-268, :348-364). */}
      <Modal
        animationType="slide"
        onRequestClose={() => {
          setShowConsent(false);
          setPendingQuery(null);
        }}
        presentationStyle="pageSheet"
        visible={showConsent}
      >
        <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: sheetTheme.colors.background }]}>
          <ScrollView contentContainerStyle={styles.consent}>
            <Text style={[styles.title2, styles.bold, { color: sheetTheme.colors.label }]}>Before using Ask AI</Text>
            <Text style={[theme.typography.body, { color: sheetTheme.colors.label }]}>
              Nexdo sends your question and relevant task and calendar information—including titles, notes, times,
              preferences, and conversation context—to OpenAI to generate answers. Do not include information you do not
              want shared. AI can make mistakes; review proposed changes before approving them.
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="OpenAI data privacy information"
              onPress={() => void Linking.openURL('https://openai.com/policies/privacy-policy/')}
              testID="ask-consent-link"
            >
              <Text style={[theme.typography.body, { color: blue }]}>OpenAI data privacy information</Text>
            </Pressable>
            <Text style={[styles.footnote, { color: sheetTheme.colors.secondaryLabel }]}>
              Optional. You can withdraw permission in Account; withdrawal stops future requests, not previous
              processing.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Allow sharing with OpenAI"
              onPress={() => {
                const query = pendingQuery;
                consent.setConsent({ ai: true });
                setShowConsent(false);
                setPendingQuery(null);
                if (query !== null) requestAfterConsent(query);
              }}
              style={[styles.approve, { backgroundColor: theme.colors.tint }]}
              testID="ask-consent-allow"
            >
              {/* `.buttonStyle(.borderedProminent)` (`:360`) inside a `VStack(alignment: .leading)`:
                  a capsule sized to its own label, not a full-width block. It fills with the
                  *inherited* tint — `.tint(.nexdoIndigo)` at the root (RootView.swift:46) — not with
                  `AskStyle.blue`, which this screen defines for the mic circle and the plain buttons
                  alone. Measured (46,89,143) against Swift's (61,41,240) before this. The response
                  card's "Approve changes" stays blue: that view sets `.tint(AskStyle.blue)` itself. */}
              <Text style={[theme.typography.body, { color: '#FFFFFF' }]}>Allow sharing with OpenAI</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now"
              onPress={() => {
                setShowConsent(false);
                setPendingQuery(null);
              }}
              style={styles.reject}
              testID="ask-consent-decline"
            >
              {/* `Button("Not now", role: .cancel)` (`:361`): plain text, leading-aligned. */}
              <Text style={[theme.typography.body, { color: blue }]}>Not now</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/** `shoppingRecommendationIntro(_:)` (AskNexdoView.swift:325-344). */
function ShoppingIntro({ context }: { context: ShoppingRecommendationContext }) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={[withAlpha(brand.nexdoBlue, 0.1), withAlpha(brand.nexdoMagenta, 0.07)]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[styles.intro, { borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}
      testID="shopping-recommendations-intro"
    >
      <View style={styles.introHeader}>
        <LinearGradient colors={INTRO_TILE} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.introTile}>
          <Ionicons name="sparkles" size={24} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.introTitles}>
          <Text style={[styles.title2, styles.bold, { color: theme.colors.ink }]}>Plan a smarter cart</Text>
          <Text style={[styles.subheadline, styles.semibold, { color: brand.nexdoIndigo }]} testID="shopping-recommendations-list">
            {context.listName}
          </Text>
        </View>
      </View>
      <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
        Ask Nexdo to spot missing staples, suggest meal ideas, compare alternatives, or check quantities using the items already on this list.
      </Text>
      <View style={styles.introNote}>
        <Ionicons name="shield-checkmark" size={17} color="#34C759" />
        <Text style={[styles.caption, styles.medium, styles.grow, { color: theme.colors.secondary }]}>Suggestions only—your list changes after you approve them.</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  medium: { fontWeight: '500' },
  // `VStack(alignment: .leading, spacing: 14).padding(16)`, radius 20, 12% indigo stroke.
  intro: { padding: 16, gap: 14, borderRadius: 20, borderWidth: 1 },
  introHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  introTile: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  introTitles: { flex: 1, gap: 3 },
  introNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  // Named text styles carry their own leading; `fontSize * 1.2` is the `.system(size:)` rule
  // only (style map section 2).
  subheadline: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 16 },
  footnote: { fontSize: 13, lineHeight: 20 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title2: { fontSize: 22, lineHeight: 28 },
  centred: { textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 22 },
  close: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  scroll: { paddingHorizontal: 20, paddingBottom: 20, gap: 10, alignItems: 'stretch' },
  tagline: { paddingTop: 14, paddingBottom: 8 },
  tryHeading: { paddingTop: 16 },
  controlsRow: { flexDirection: 'row', justifyContent: 'flex-end' },

  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 16, paddingBottom: 2 },
  showSuggestions: { paddingVertical: 12 },
  // A `ProgressView` with a label stacks the label under the spinner.
  progress: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  failure: { gap: 8, paddingVertical: 12 },

  composer: { paddingHorizontal: 20, paddingBottom: 12, gap: 14 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  divider: { height: StyleSheet.hairlineWidth },
  speechRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speechError: { gap: 6 },

  field: {
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: 'top',
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  askButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  micButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  // `VStack(alignment: .leading, spacing: 18).padding(24)`, so both buttons are leading-aligned
  // and sized to their own labels.
  consent: { padding: 24, gap: 18, alignItems: 'flex-start' },
  approve: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  reject: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
