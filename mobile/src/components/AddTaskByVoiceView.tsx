import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NexdoTaskBackdrop, TaskSymbol, Text } from '../components';
import { creationDateFor } from '../lib/taskCreation';
import { useCreateTask, type ScheduleConflict } from '../query/useTasks';
import { useConsent } from '../store/consent';
import { useSession } from '../store/session';
import { useTheme } from '../theme';
import { startVoiceCaptureStub, type VoiceCaptureStub } from '../voice/taskCaptureStub';
import { VOICE_PHASE_STATUS, type VoiceCapturePhase } from '../voice/taskCaptureTypes';

/** `AddTaskByVoiceView.swift:69-71`, task mode. */
const TASK_EXAMPLES = ['“Call Damien tomorrow at 11 AM”', '“Actually make that noon”', '“That’s all”'];

/** `AddTaskByVoiceView.swift:69-71`, ask mode. */
const ASK_EXAMPLES = [
  '“What should I focus on today?”',
  '“Find time for a walk tomorrow”',
  '“Remind me to call Damien at 11 AM”',
];

export type AddTaskByVoiceViewProps = {
  /**
   * `AddTaskByVoiceView(askMode:)` (ios/App/AddTaskByVoiceView.swift:20). The flag changes COPY ONLY
   * — the header title (`:36`), the heading and subtitle (`:41-42`) and the three examples
   * (`:69-71`). Every state, control and action below is shared with the task-capture mode.
   */
  askMode?: boolean;
};

/**
 * Port of `AddTaskByVoiceView` (ios/App/AddTaskByVoiceView.swift) — layout, states and the
 * review/confirm step — over a STUB transcription session.
 *
 * What is real: the consent gate, the phase machine, every piece of copy, and the confirm step, which
 * posts the parsed task through the same `useCreateTask` mutation the manual editor uses.
 *
 * What is stubbed: everything below the phase machine. `src/voice/taskCaptureStub.ts` yields a fixed
 * transcript on timers instead of opening a WebRTC session. PHASE 9 REPLACES IT with the real
 * `VoiceConversationSession` from the Phase 0 proof of concept.
 */
export function AddTaskByVoiceView({ askMode = false }: AddTaskByVoiceViewProps) {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);
  const consent = useConsent();

  const [phase, setPhase] = useState<VoiceCapturePhase>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);
  const session = useRef<VoiceCaptureStub | null>(null);

  const create = useCreateTask({ onConflict: setConflict });
  const zone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => () => session.current?.stop(), []);

  if (conflict) {
    const pending = conflict;
    setConflict(null);
    Alert.alert('Review this time', pending.warnings.join('\n\n'), [
      { text: 'Keep previous schedule', style: 'cancel', onPress: pending.cancel },
      { text: 'Save anyway', onPress: pending.confirm },
    ]);
  }

  const start = () => {
    setError(null);
    try {
      session.current = startVoiceCaptureStub(setPhase, setTranscript);
    } catch (cause) {
      setPhase('error');
      setError(cause instanceof Error ? cause.message : 'Voice is unavailable.');
    }
  };

  /** `.alert` consent gate (AddTaskByVoiceView.swift:85-88). */
  const requestConsent = () => {
    Alert.alert(
      'Share your voice with Nexdo?',
      'Your voice and relevant task, calendar, and recommendation details are shared with OpenAI during this conversation. Clear task requests are saved automatically. Calls and emails still require your approval.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Allow and start',
          onPress: () => {
            consent.setConsent({ ai: true, voice: true });
            start();
          },
        },
      ],
    );
  };

  const confirm = () => {
    const title = transcript.trim();
    if (title.length === 0) return;
    create.mutate(
      { title, notes: '', durationMin: 30, startAt: new Date(creationDateFor('Today', zone)).toISOString(), projectId: null },
      {
        onSuccess: (task) => {
          setAdded((previous) => [...previous, task.title]);
          setTranscript('');
          setPhase('idle');
        },
        onError: (cause) => {
          if (cause.name === 'ScheduleConflictCancelled') return;
          setPhase('error');
          setError(cause.message);
        },
      },
    );
  };

  return (
    <View style={styles.fill}>
      <NexdoTaskBackdrop />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.heading, { color: theme.colors.ink }]}>
          {askMode ? 'Ask Nexdo anything' : 'Speak your task'}
        </Text>
        <Text style={[styles.body, { color: theme.colors.secondary }]}>
          {askMode
            ? 'Ask about your tasks, calendar, or next step. Keep talking to plan or make changes.'
            : 'Tell me what you want to do. Keep talking to add more or make changes.'}
        </Text>

        <Text style={[styles.status, { color: theme.colors.tint }]} accessibilityLiveRegion="polite" testID="voice-status">
          {VOICE_PHASE_STATUS[phase]}
        </Text>

        {error ? (
          <Text style={[styles.body, styles.centred, { color: theme.colors.danger }]} testID="voice-error">
            {error}
          </Text>
        ) : null}

        {transcript.length > 0 ? (
          <View style={[styles.transcript, { backgroundColor: theme.colors.surface }]}>
            <Text style={[theme.typography.body, { color: theme.colors.ink }]} testID="voice-transcript">
              {transcript}
            </Text>
          </View>
        ) : null}

        {/* "Added this session" (AddTaskByVoiceView.swift:52-60) */}
        {added.length > 0 ? (
          <View style={styles.added}>
            <Text style={[styles.addedTitle, { color: theme.colors.ink }]}>Added this session</Text>
            {added.map((title, index) => (
              <Text key={`${title}-${index}`} style={[theme.typography.body, { color: theme.colors.ink }]}>
                {title}
              </Text>
            ))}
          </View>
        ) : null}

        {/* "Try saying something like:" (AddTaskByVoiceView.swift:68-71) */}
        {phase === 'idle' && added.length === 0 ? (
          <View style={styles.examples}>
            <Text style={[styles.body, { color: theme.colors.secondary }]}>Try saying something like:</Text>
            {(askMode ? ASK_EXAMPLES : TASK_EXAMPLES).map((example) => (
              <Text key={example} style={[styles.body, { color: theme.colors.secondary }]}>
                {example}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.separator }]}>
        {phase === 'review' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add this task"
            accessibilityState={{ disabled: create.isPending }}
            disabled={create.isPending}
            onPress={confirm}
            style={[styles.action, { backgroundColor: theme.colors.tint }]}
            testID="voice-confirm"
          >
            <Text style={[styles.actionLabel, { color: '#FFFFFF' }]}>{create.isPending ? 'Adding…' : 'Add this task'}</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={phase === 'listening' || phase === 'transcribing' ? 'Stop' : 'Start speaking'}
            onPress={() => {
              if (phase === 'listening' || phase === 'transcribing') {
                session.current?.stop();
                setPhase('idle');
                return;
              }
              if (consent.voice && consent.ai) start();
              else requestConsent();
            }}
            style={[styles.action, { backgroundColor: theme.colors.tint }]}
            testID="voice-start"
          >
            <TaskSymbol name="mic.fill" size={20} color="#FFFFFF" />
            <Text style={[styles.actionLabel, { color: '#FFFFFF' }]}>
              {phase === 'listening' || phase === 'transcribing' ? 'Stop' : 'Start speaking'}
            </Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={() => {
            session.current?.stop();
            router.back();
          }}
          style={styles.done}
          testID="voice-done"
        >
          <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: 24, gap: 14 },
  heading: { fontSize: 34, lineHeight: 41, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  centred: { textAlign: 'center' },
  status: { fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  transcript: { padding: 16, borderRadius: 18 },
  added: { gap: 6, alignItems: 'center' },
  addedTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  examples: { gap: 6, alignItems: 'center' },
  footer: { padding: 20, gap: 12, borderTopWidth: StyleSheet.hairlineWidth },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 17 },
  actionLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  done: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
