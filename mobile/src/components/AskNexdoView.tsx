import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ASK_INTENTS, ASK_MAX_LENGTH, ASK_TEXT_EXAMPLES } from '../lib/askIntents';
import { blockedTurn, policyGuardRefusal } from '../lib/assistantPolicy';
import { spokenText } from '../lib/assistantPresentation';
import { speechChunks } from '../lib/speechText';
import { useAsk } from '../query/useAssistant';
import { useAssistantStore } from '../store/assistant';
import { useConsent } from '../store/consent';
import { brand, useTheme } from '../theme';
import { startSpeechStub, type SpeechStub } from '../voice/speechStub';
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
 * NOT PORTED: `startWithVoice`, because no call site in the Swift app passes it (the only three are
 * RootView.swift:113, RootView.swift:19-21 behind DEBUG launch arguments, and CalendarView.swift:158).
 */
export type AskNexdoViewProps = {
  textPage: boolean;
  initialPrompt?: string;
};

export function AskNexdoView({ textPage, initialPrompt = '' }: AskNexdoViewProps) {
  const theme = useTheme();
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
  const speech = useRef<SpeechStub | null>(null);

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
    try {
      speech.current = startSpeechStub(speechChunks(body), {
        onPreparing: setPreparingSpeech,
        onPlaying: setPlaying,
        onFinished: () => setReadingSection(null),
      });
    } catch (cause) {
      setPreparingSpeech(false);
      setReadingSection(null);
      setVoiceError(`Your answer is ready to read. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
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
      { text: query },
      {
        onSuccess: () => {
          if (prompt.trim() === query) setPrompt('');
          if (speakResponse) speakAnswer();
        },
        onError: () => setFailedQuery(query),
      },
    );
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
      { text: query },
      {
        onSuccess: () => {
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
    router.back();
  };

  const field = (
    <TextInput
      accessibilityLabel="Ask Nexdo follow-up"
      multiline
      onChangeText={setPrompt}
      placeholder="Type your prompt…"
      placeholderTextColor={theme.colors.secondary}
      style={[
        styles.field,
        // `.lineLimit(textPage && model.turn == nil ? 4...8 : 1...4)`
        { minHeight: textPage && turn === null ? 96 : 44, color: theme.colors.ink, backgroundColor: theme.colors.secondaryBackground, borderColor: theme.colors.separator },
      ]}
      testID="ask-field"
      value={prompt}
    />
  );

  const controls = (
    <View style={styles.controls}>
      <Pressable
        accessibilityLabel="Ask Nexdo"
        accessibilityRole="button"
        accessibilityState={{ disabled: !validPrompt || blocked }}
        disabled={!validPrompt || blocked}
        onPress={() => request(prompt)}
        style={[styles.askButton, { backgroundColor: blue, opacity: validPrompt && !blocked ? 1 : 0.55 }]}
        testID="ask-submit"
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={[styles.subheadline, styles.semibold, { color: '#FFFFFF' }]}>Ask Nexdo</Text>
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
          <TaskSymbol name={playing ? 'speaker.wave.2.fill' : 'mic'} size={20} color="#FFFFFF" />
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
          <Text style={[styles.subheadline, styles.grow, { color: theme.colors.ink }]}>Preparing voice reply…</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={stopSpeech} testID="ask-speech-cancel">
            <Text style={[styles.subheadline, { color: blue }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {playing ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Stop speaking" onPress={stopSpeech} style={styles.speechRow} testID="ask-speech-stop">
          <TaskSymbol name="stop.circle" size={17} color={blue} />
          <Text style={[styles.subheadline, { color: blue }]}>Stop speaking</Text>
        </Pressable>
      ) : null}

      {voiceError !== null ? (
        <View style={styles.speechError}>
          <Text style={[styles.caption, { color: theme.colors.ink }]} testID="ask-voice-error">
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
            <Text style={[styles.subheadline, { color: blue, opacity: blocked || preparingSpeech ? 0.55 : 1 }]}>Retry voice reply</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composerRow}>
        <View style={styles.grow}>{field}</View>
        {controls}
      </View>

      {prompt.length > ASK_MAX_LENGTH ? (
        <Text style={[styles.caption, { color: theme.colors.secondary }]} testID="ask-too-long">
          Keep your question under 4,000 characters.
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {/* Header (AskNexdoView.swift:184-208). */}
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title2, styles.bold, styles.grow, { color: theme.colors.ink }]}>
          {textPage ? 'Free form Text' : 'Ask Nexdo'}
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
            <Text style={[styles.subheadline, styles.tagline, { color: theme.colors.secondary }]}>Let’s make room for what matters.</Text>

            {textPage ? (
              <>
                <Text style={[styles.title2, styles.bold, { color: theme.colors.ink }]}>What would you like help with?</Text>
                <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
                  Type a question or tell Nexdo what to plan, create, or change.
                </Text>
                {field}
                <View style={styles.controlsRow}>{controls}</View>
                <Text style={[styles.headline, styles.tryHeading, { color: theme.colors.ink }]}>Try a prompt</Text>
                {ASK_TEXT_EXAMPLES.map((example) => (
                  <AskExampleRow key={example} example={example} disabled={blocked} onPress={() => setPrompt(example)} />
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
                <TaskSymbol name="questionmark.circle" size={15} color={theme.colors.secondary} />
                <Text numberOfLines={2} style={[styles.subheadline, styles.grow, { color: theme.colors.secondary }]} testID="ask-last-prompt">
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
          <View style={styles.progress}>
            <ActivityIndicator color={blue} size="small" />
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]} testID="ask-submitting">
              Asking Nexdo…
            </Text>
          </View>
        ) : null}

        {failedQuery !== null ? (
          <View style={styles.failure}>
            <Text style={[styles.subheadline, { color: theme.colors.ink }]} testID="ask-failed">
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
              <Text style={[styles.subheadline, { color: blue }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* `.safeAreaInset(edge: .bottom)` (AskNexdoView.swift:264). */}
      {textPage ? (turn !== null ? composer : null) : (
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
        <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
          <ScrollView contentContainerStyle={styles.consent}>
            <Text style={[styles.title2, styles.bold, { color: theme.colors.ink }]}>Before using Ask AI</Text>
            <Text style={[theme.typography.body, { color: theme.colors.ink }]}>
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
            <Text style={[styles.footnote, { color: theme.colors.secondary }]}>
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
              style={[styles.approve, { backgroundColor: blue }]}
              testID="ask-consent-allow"
            >
              <Text style={[styles.subheadline, styles.semibold, { color: '#FFFFFF' }]}>Allow sharing with OpenAI</Text>
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
              <Text style={[styles.subheadline, { color: blue }]}>Not now</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  footnote: { fontSize: 13, lineHeight: 18 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title2: { fontSize: 22, lineHeight: 28 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 22 },
  close: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  scroll: { paddingHorizontal: 20, paddingBottom: 20, gap: 10, alignItems: 'stretch' },
  tagline: { paddingTop: 14, paddingBottom: 8 },
  tryHeading: { paddingTop: 16 },
  controlsRow: { flexDirection: 'row', justifyContent: 'flex-end' },

  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 16, paddingBottom: 2 },
  showSuggestions: { paddingVertical: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
  failure: { gap: 8, paddingVertical: 12 },

  composer: { paddingHorizontal: 20, paddingBottom: 12, gap: 14 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  divider: { height: StyleSheet.hairlineWidth },
  speechRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speechError: { gap: 6 },

  field: {
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: 'top',
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  askButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  micButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  consent: { padding: 24, gap: 18 },
  approve: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reject: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
