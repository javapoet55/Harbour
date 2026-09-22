import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '../store/session';
import { useConsent } from '../store/consent';
import { voiceStatus } from '../voice/conversation';
import { useVoiceSession } from '../voice/useVoiceSession';
import type { VoiceScope } from '../voice/protocol';
import { brand, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * `AddTaskByVoiceView` (ios/App/AddTaskByVoiceView.swift:4), **body `:27-124`**, read top to bottom.
 *
 * Children followed: the private `orb` (`:138-160`), and `VoiceConversationSession`
 * (ios/Sources/NexdoCore/VoiceConversationSession.swift:81) via `src/voice/useVoiceSession.ts`.
 *
 * ONE VIEW, THREE MODES, ONE SESSION. `askMode` and `calendarOnly` change FOUR pieces of copy and the
 * session's `scope`; the conversation itself is identical in all three. There is no separate
 * transcription-then-confirm step anywhere in Swift — the model creates and edits tasks through TOOL
 * CALLS mid-conversation, and the screen lists what it made under "Added this session".
 *
 * The Phase 3 stub's "review → Add this task" flow was an invention of the stub and is gone.
 */
export type AddTaskByVoiceViewProps = {
  /** `AddTaskByVoiceView(askMode:)` (`:20`). */
  askMode?: boolean;
  /** `AddTaskByVoiceView(calendarOnly:)` (`:20`), which also narrows the tool scope. */
  calendarOnly?: boolean;
};

/** `AddTaskByVoiceView.swift:69-71`. The ask-mode examples changed in 8c5f969 (moments and shopping). */
const EXAMPLES = {
  calendar: ['“Dentist appointment tomorrow at 11 AM for 30 minutes”', '“Team meeting Friday at 2 PM for an hour”', '“That’s all”'],
  ask: ['“What birthdays are coming up?”', '“Add two gallons of milk to my shopping list”', '“Remind me to call Damien at 11 AM”'],
  task: ['“Call Damien tomorrow at 11 AM”', '“Actually make that noon”', '“That’s all”'],
} as const;

/** The consent alert (`:87-91`). */
const CONSENT_BODY =
  'Your voice and relevant task, calendar, and recommendation details are shared with OpenAI during this conversation. Clear task requests are saved automatically. Calls and emails still require your approval.';

export function AddTaskByVoiceView({ askMode = false, calendarOnly = false }: AddTaskByVoiceViewProps) {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);
  // `@State private var consent` (`:11`): the alert is shown until it is answered.
  const [allowed, setAllowed] = useState(() => {
    const consent = useConsent.getState();
    return consent.ai && consent.voice;
  });
  const [asked, setAsked] = useState(false);

  const scope: VoiceScope = calendarOnly ? 'calendar' : 'general';
  const voice = useVoiceSession({ scope, enabled: allowed, onClose: () => router.back() });

  /**
   * `.task { … if model.aiConsent && model.voiceConsent { await start() } else { consent = true } }`
   * (`:92-101`). `.task` runs after the view appears, so the alert is raised on a timer rather than
   * during the commit.
   */
  useEffect(() => {
    if (allowed || asked) return;
    const timer = setTimeout(() => {
      setAsked(true);
      Alert.alert(calendarOnly ? 'Use voice to add calendar events?' : 'Use voice to manage tasks?', CONSENT_BODY, [
        { text: 'Not now', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Allow and start',
          onPress: () => {
            useConsent.getState().setConsent({ ai: true, voice: true });
            setAllowed(true);
          },
        },
      ]);
    }, 0);
    return () => clearTimeout(timer);
  }, [allowed, asked, calendarOnly]);

  const status = voice.starting ? 'Connecting…' : voiceStatus(voice.state);
  const error = voice.startupError ?? voice.state.error;
  const examples = calendarOnly ? EXAMPLES.calendar : askMode ? EXAMPLES.ask : EXAMPLES.task;
  const muteDisabled =
    voice.starting || ['idle', 'connecting', 'closing', 'disconnected', 'connectionLost'].includes(voice.state.phase);

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {/* The two blurred brand circles (`:30-32`). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blobTop, { backgroundColor: withAlpha(brand.nexdoMagenta, 0.06) }]} />
        <View style={[styles.blobBottom, { backgroundColor: withAlpha(brand.nexdoBlue, 0.05) }]} />
      </View>

      {/* Header (`:34-38`). */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            voice.close();
            router.back();
          }}
          testID="voice-close"
        >
          <View style={styles.closeRow}>
            <TaskSymbol color={theme.colors.link} name="xmark" size={17} />
            <Text style={[theme.typography.body, { color: theme.colors.link }]}>Close</Text>
          </View>
        </Pressable>
        <View style={styles.grow} />
        <Text accessibilityRole="header" style={[styles.headline, { color: theme.colors.ink }]}>
          {askMode ? 'Ask by Voice' : 'Add by Voice'}
        </Text>
        <View style={styles.grow} />
        {/* `Text("Close").hidden()` (`:37`): keeps the title centred. */}
        <View style={styles.closeBalance} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.largeTitle, styles.centred, { color: theme.colors.ink }]}>
          {calendarOnly ? 'Speak your appointment' : askMode ? 'Ask Nexdo anything' : 'Speak your task'}
        </Text>
        <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondary }]}>
          {calendarOnly
            ? 'Tell me the event, date, and time. I’ll add it to your calendar.'
            : askMode
              ? // 8c5f969 (AddTaskByVoiceView.swift:42).
                'Ask about tasks, calendar, important moments, or shopping lists. Keep talking to plan or make changes.'
              : 'Tell me what you want to do. Keep talking to add more or make changes.'}
        </Text>

        <VoiceOrb muted={voice.state.muted} phase={voice.state.phase} />

        <Text
          accessibilityLiveRegion="polite"
          style={[styles.title2, styles.centred, { color: theme.colors.link }]}
          testID="voice-status"
        >
          {status}
        </Text>

        {error !== null ? (
          <Text style={[theme.typography.body, styles.centred, { color: theme.colors.danger }]} testID="voice-error">
            {error}
          </Text>
        ) : null}

        {voice.state.transcript.length > 0 ? (
          <View style={[styles.transcript, { backgroundColor: theme.colors.surface }]}>
            <Text style={[theme.typography.body, { color: theme.colors.ink }]} testID="voice-transcript">
              {voice.state.transcript}
            </Text>
          </View>
        ) : null}

        {voice.state.reply.length > 0 ? (
          <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondary }]} testID="voice-reply">
            {voice.state.reply}
          </Text>
        ) : null}

        {voice.state.sessionCreatedTasks.length > 0 ? (
          <View style={styles.added} testID="voice-added">
            <Text style={[styles.headline, { color: theme.colors.ink }]}>Added this session</Text>
            {voice.state.sessionCreatedTasks.map((task) => (
              <View key={task.id} style={[styles.addedRow, { backgroundColor: theme.colors.surface }]}>
                <TaskSymbol color="#34C759" name="checkmark.circle.fill" size={20} />
                <View style={styles.grow}>
                  <Text style={[styles.headline, { color: theme.colors.ink }]}>{task.title}</Text>
                  {task.startAt ? (
                    <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
                      {scheduleLabel(task.startAt, profile?.timeZone)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : voice.state.transcript.length === 0 ? (
          <View style={styles.examples}>
            <Text style={[styles.subheadline, styles.centred, { color: theme.colors.secondary }]}>
              Try saying something like:
            </Text>
            {examples.map((example) => (
              <Text key={example} style={[styles.subheadline, styles.centred, { color: theme.colors.ink }]}>
                {example}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Footer (`:76-84`). */}
      <View style={styles.footer}>
        <Pressable
          accessibilityLabel={voice.state.muted ? 'Unmute' : 'Mute'}
          accessibilityRole="button"
          accessibilityState={{ disabled: muteDisabled }}
          disabled={muteDisabled}
          onPress={voice.toggleMute}
          style={[styles.muteRow, { opacity: muteDisabled ? 0.55 : 1 }]}
          testID="voice-mute"
        >
          <TaskSymbol color={theme.colors.link} name={voice.state.muted ? 'mic.slash.fill' : 'mic.fill'} size={17} />
          <Text style={[theme.typography.body, { color: theme.colors.link }]}>{voice.state.muted ? 'Unmute' : 'Mute'}</Text>
        </Pressable>
        <View style={styles.grow} />
        <Pressable
          accessibilityLabel="Done"
          accessibilityRole="button"
          accessibilityState={{ disabled: voice.state.phase === 'closing' }}
          disabled={voice.state.phase === 'closing'}
          onPress={() => {
            voice.finish();
            if (voice.state.phase === 'idle') router.back();
          }}
          style={[styles.done, { backgroundColor: theme.colors.tint, opacity: voice.state.phase === 'closing' ? 0.55 : 1 }]}
          testID="voice-done"
        >
          <Text style={[theme.typography.body, { color: '#FFFFFF' }]}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/**
 * `orb` (AddTaskByVoiceView.swift:138-160).
 *
 * VISUAL GAP: Swift drives three breathing rings and 25 capsules off a 24fps `TimelineView`. This is
 * the same composition held still — the mic disc, its gradient, its white ring, the three rings and
 * the 25 capsules at their resting heights — because a per-frame animation loop in JavaScript costs
 * more than it conveys. `accessibilityHidden` either way.
 */
function VoiceOrb({ muted, phase }: { muted: boolean; phase: string }) {
  const active = phase === 'userSpeaking' || phase === 'assistantSpeaking';
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.orb} testID="voice-orb">
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.ring,
            {
              width: 185 + index * 26,
              height: 185 + index * 26,
              borderRadius: (185 + index * 26) / 2,
              borderColor: withAlpha(brand.nexdoIndigo, 0.08),
            },
          ]}
        />
      ))}
      <View style={styles.bars}>
        {Array.from({ length: 25 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              // `8 + (active ? 38 : 12) * abs(sin(...))` at rest.
              { height: 8 + (active ? 38 : 12) * Math.abs(Math.sin(index * 0.8)), backgroundColor: withAlpha(brand.nexdoIndigo, 0.28) },
            ]}
          />
        ))}
      </View>
      <LinearGradient
        colors={[brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.orbDisc}
      >
        <TaskSymbol color="#FFFFFF" name={muted ? 'mic.slash.fill' : 'mic.fill'} size={58} />
      </LinearGradient>
    </View>
  );
}

/** `date.formatted(.abbreviated, .shortened, timeZone: account)` (AddTaskByVoiceView.swift:60). */
function scheduleLabel(startAt: string, timeZone: string | undefined): string {
  const at = Date.parse(startAt);
  if (Number.isNaN(at)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  centred: { textAlign: 'center' },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },

  blobTop: { position: 'absolute', width: 420, height: 420, borderRadius: 210, right: -210, top: -260 },
  blobBottom: { position: 'absolute', width: 400, height: 400, borderRadius: 200, left: -230, top: 180 },

  header: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  closeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  closeBalance: { width: 58 },

  // `VStack(spacing: 18).padding(24)`
  scroll: { padding: 24, gap: 18, alignItems: 'stretch' },
  transcript: { padding: 16, borderRadius: 18 },
  added: { gap: 12 },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16 },
  examples: { gap: 12, padding: 16 },

  orb: { height: 260, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
  bars: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { width: 5, borderRadius: 2.5 },
  orbDisc: { width: 146, height: 146, borderRadius: 73, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },

  footer: { flexDirection: 'row', alignItems: 'center', padding: 24 },
  muteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  done: { minHeight: 44, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
