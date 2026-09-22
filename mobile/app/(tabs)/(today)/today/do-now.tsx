import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { DoNowChoice, DoNowRecommendation } from '../../../../src/api';
import { Text } from '../../../../src/components';
import { KeyboardAwareScrollView } from '../../../../src/components/keyboard';
import { durationLabel } from '../../../../src/lib/focusClock';
import { parseServerDate } from '../../../../src/lib/taskQuery';
import { useTasks } from '../../../../src/query/useTasks';
import { canStartRecommendation, useDoNow } from '../../../../src/query/useToday';
import { useConsent } from '../../../../src/store/consent';
import { useFocus } from '../../../../src/store/focus';
import { brand, useTheme } from '../../../../src/theme';

/**
 * Port of `DoNowView` (ios/App/DoNowView.swift), built from `body` at `:15-107`.
 * Child view files followed: none — `choiceLabel` and `deadline` are private funcs on the same view.
 *
 * THE BRIEF ASKED FOR A PORTED RECOMMENDATION ENGINE. There isn't one.
 * `ios/Sources/NexdoCore/DoNowRecommendation.swift` declares only `Decodable` response types plus
 * `DurationDisplay`; the ranking — energy, working hours, quiet hours, active focus, preferences —
 * happens entirely on the SERVER. `AppModel.recommendDoNow` (NexdoApp.swift:603-609) asks
 * `/api/assistant` a question in prose and reads the `executive` field off the turn. There is no
 * do-now endpoint and no client-side ordering to test. Following Swift, and saying so.
 */
export default function DoNow() {
  const theme = useTheme();
  const consent = useConsent();
  const tasks = useTasks();
  const focusSession = useFocus((state) => state.session);
  const startFocus = useFocus((state) => state.startFocus);
  const doNow = useDoNow();

  const [recommendation, setRecommendation] = useState<DoNowRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');
  /** `requestedUntil`: the instant the entered window ends, so it shrinks as time passes. */
  const [requestedUntil, setRequestedUntil] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const loading = doNow.isPending;

  /** `requestedMinutes` (DoNowView.swift:13): what is LEFT of the entered window, never negative. */
  const remainingRequested = useCallback(
    (until: number | null) => (until === null ? null : Math.max(0, Math.ceil((until - Date.now()) / 60_000))),
    [],
  );

  /**
   * `refresh()` (DoNowView.swift:122-131).
   *
   * `until` is passed explicitly by the Update button, because Swift's `Task { await refresh() }`
   * runs AFTER `requestedUntil` is written and therefore reads the new value, while a callback here
   * would still close over the old one.
   */
  const refresh = useCallback((until: number | null = requestedUntil) => {
    if (doNow.isPending || starting) return;
    setError(null);
    setRecommendation(null);
    const minutes = remainingRequested(until);
    if (minutes === 0) {
      setError('That free-time window has ended. Update your available minutes or use your calendar opening.');
      return;
    }
    doNow.mutate(
      { minutes, aiConsent: consent.ai },
      { onSuccess: setRecommendation, onError: (cause) => setError(cause.message) },
    );
    // `doNow` is a stable mutation object; including it would re-run this every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent.ai, remainingRequested, requestedUntil, starting]);

  /**
   * `.task { if aiConsent { await refresh() }; while !cancelled { sleep(60); if active { refresh() } } }`
   * (DoNowView.swift:98-105). The scene-phase check is the interval itself: an unmounted screen has no
   * interval, which is the same outcome as SwiftUI pausing an inactive one.
   */
  useEffect(() => {
    if (!consent.ai) return;
    // Swift's `.task` runs asynchronously after the view appears, so the first refresh is deferred
    // rather than fired during the effect itself.
    const first = setTimeout(() => refresh(), 0);
    const timer = setInterval(() => refresh(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [consent.ai, refresh]);

  /** `start(_:)` (DoNowView.swift:132-144). */
  const start = (choice: DoNowChoice) => {
    if (starting || loading) return;
    const minutes = remainingRequested(requestedUntil);
    if (minutes !== null && choice.focusMinutes > minutes) {
      refresh();
      setError('Your available time has changed. Choose from the refreshed options.');
      return;
    }
    const task = tasks.data?.tasks.find((item) => item.id === choice.taskId);
    if (!task) {
      setError('Your tasks changed. Refresh Tasks and try again.');
      return;
    }
    setStarting(true);
    setError(null);
    void startFocus(task, choice.focusMinutes, true)
      .then(() => router.back())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Please try again.');
        setRecommendation(null);
      })
      .finally(() => setStarting(false));
  };

  const next = recommendation?.nextAction ?? null;
  const canStart = recommendation ? canStartRecommendation(recommendation) : false;

  return (
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} style={{ backgroundColor: theme.colors.background }}>
      {!consent.ai ? (
        <>
          <Text style={[theme.typography.body, { color: theme.colors.ink }]}>
            Nexdo uses your tasks, calendar, and preferences to recommend what to do now. AI explanations may share this
            information with OpenAI.
          </Text>
          <Prominent title="Allow and find my next task" onPress={() => consent.setConsent({ ai: true })} testID="do-now-consent" />
        </>
      ) : (
        <>
          <View style={styles.minutesRow}>
            <TextInput
              accessibilityLabel="Minutes available (optional)"
              placeholder="Minutes available (optional)"
              placeholderTextColor={theme.colors.secondary}
              value={customMinutes}
              onChangeText={setCustomMinutes}
              keyboardType="number-pad"
              style={[theme.typography.body, styles.minutesInput, { color: theme.colors.ink, borderColor: theme.colors.separator }]}
              testID="do-now-minutes"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Update"
              accessibilityState={{ disabled: loading || starting }}
              disabled={loading || starting}
              onPress={() => {
                const input = customMinutes.trim();
                if (input.length === 0) {
                  setRequestedUntil(null);
                  refresh(null);
                  return;
                }
                const value = Number(input);
                if (!Number.isInteger(value) || value < 1 || value > 480) {
                  setError('Enter between 1 and 480 minutes.');
                  return;
                }
                const until = Date.now() + value * 60_000;
                setRequestedUntil(until);
                refresh(until);
              }}
              style={styles.update}
              testID="do-now-update"
            >
              <Text style={[theme.typography.body, { color: theme.colors.link }]}>Update</Text>
            </Pressable>
          </View>

          <Text style={[styles.caption, { color: theme.colors.secondary }]}>
            Leave this blank to use your current opening within saved working hours. Enter minutes to work outside those
            hours. Appointments and buffers still apply.
          </Text>

          {requestedUntil !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use my calendar opening"
              accessibilityState={{ disabled: loading || starting }}
              disabled={loading || starting}
              onPress={() => {
                setCustomMinutes('');
                setRequestedUntil(null);
                refresh(null);
              }}
              style={styles.link}
              testID="do-now-calendar-opening"
            >
              <Text style={[theme.typography.body, { color: theme.colors.link }]}>Use my calendar opening</Text>
            </Pressable>
          ) : null}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator />
              <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Finding your best next step…</Text>
            </View>
          ) : null}

          {error !== null ? (
            <>
              <Text style={[theme.typography.body, { color: theme.colors.danger }]} testID="do-now-error">
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh recommendation"
                accessibilityState={{ disabled: loading || starting }}
                disabled={loading || starting}
                onPress={() => refresh()}
                style={styles.link}
                testID="do-now-refresh"
              >
                <Text style={[theme.typography.body, { color: theme.colors.link }]}>Refresh recommendation</Text>
              </Pressable>
            </>
          ) : null}

          {recommendation && next ? (
            <>
              <Text style={[styles.title, { color: theme.colors.ink }]} testID="do-now-window">
                {next.outsideWorkingHours === true
                  ? 'Outside your working hours'
                  : `You have ${durationLabel(next.availableWindowMinutes)} free now`}
              </Text>

              {next.remainingWorkingMinutesToday !== null && next.remainingWorkingMinutesToday !== undefined ? (
                <>
                  <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
                    {`Unreserved working time remaining today: ${durationLabel(next.remainingWorkingMinutesToday)}`}
                  </Text>
                  <Text style={[styles.caption, { color: theme.colors.secondary }]}>
                    This can include several gaps. Unscheduled tasks have not reserved time in your calendar.
                  </Text>
                </>
              ) : null}

              {next.bestAction ? (
                <>
                  <View style={[styles.bestCard, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.07) }]} testID="do-now-best">
                    <Text style={[styles.bestLabel, { color: theme.colors.link }]}>
                      {next.continuingFocus ? 'Keep your focus' : 'Best thing to do now'}
                    </Text>
                    <ChoiceLabel choice={next.bestAction} zone={recommendation.timeZone} />
                    {next.bestAction.reasons[0] ? (
                      <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{next.bestAction.reasons[0]}</Text>
                    ) : null}
                    {focusSession?.taskId === next.bestAction.taskId ? (
                      <Prominent title="Continue Focus Session" onPress={() => router.back()} testID="do-now-continue" />
                    ) : (
                      <Prominent
                        title={starting ? 'Starting…' : 'Start Focus Session'}
                        disabled={!canStart || starting || loading}
                        onPress={() => next.bestAction && start(next.bestAction)}
                        testID="do-now-start"
                      />
                    )}
                  </View>

                  {!canStart ? (
                    <Text style={[styles.caption, { color: theme.colors.secondary }]}>
                      Refresh your calendar before starting a recommended session.
                    </Text>
                  ) : null}

                  {next.alternatives.length > 0 ? (
                    <>
                      <Text style={[styles.heading, { color: theme.colors.ink }]}>Other options</Text>
                      {next.alternatives.slice(0, 2).map((choice) => (
                        <Pressable
                          key={choice.taskId}
                          accessibilityRole="button"
                          accessibilityLabel={choice.title}
                          accessibilityHint={`Starts a ${choice.focusMinutes}-minute focus session`}
                          accessibilityState={{ disabled: !canStart || starting || loading }}
                          disabled={!canStart || starting || loading}
                          onPress={() => start(choice)}
                          style={[styles.alternative, { backgroundColor: theme.colors.surface }]}
                          testID={`do-now-alternative-${choice.taskId}`}
                        >
                          <View style={styles.grow}>
                            <ChoiceLabel choice={choice} zone={recommendation.timeZone} />
                          </View>
                          <Text style={[theme.typography.body, { color: theme.colors.link }]}>▶</Text>
                        </Pressable>
                      ))}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>{recommendation.summary}</Text>
                  {next.outsideWorkingHours !== true ? (
                    <Text style={[styles.subheadline, { color: theme.colors.ink }]}>
                      No task fits this current opening. You can enter a different amount of available time above.
                    </Text>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </>
      )}
    </KeyboardAwareScrollView>
  );
}

/** `choiceLabel(_:zone:)` (DoNowView.swift:108-115). */
function ChoiceLabel({ choice, zone }: { choice: DoNowChoice; zone: string }) {
  const theme = useTheme();
  const due = choice.dueAt ? ` · Due ${deadline(choice.dueAt, zone)}` : '';
  return (
    <View style={styles.choice}>
      <Text style={[styles.choiceTitle, { color: theme.colors.ink }]}>{choice.title}</Text>
      <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
        {`~${choice.focusMinutes} min${choice.partial ? ' focus block' : ''}${due}`}
      </Text>
    </View>
  );
}

/**
 * `deadline(_:zone:)` (DoNowView.swift:116-121): the time alone for today, date and time otherwise.
 */
function deadline(value: string, zone: string): string {
  const at = parseServerDate(value);
  if (at === null) return 'date unavailable';
  try {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(at));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      ...(day === today ? {} : { dateStyle: 'short' }),
      timeStyle: 'short',
    }).format(new Date(at));
  } catch {
    return 'date unavailable';
  }
}

/** `.buttonStyle(.borderedProminent)`. */
function Prominent({
  title,
  onPress,
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
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
      style={[styles.prominent, { backgroundColor: theme.colors.tint }, disabled && styles.dimmed]}
    >
      <Text style={[styles.prominentLabel, { color: '#FFFFFF' }]}>{title}</Text>
    </Pressable>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  // `.padding(24)` with `VStack(alignment: .leading, spacing: 20)`.
  scroll: { padding: 24, gap: 20 },
  minutesRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  minutesInput: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  update: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  caption: { fontSize: 12, lineHeight: 16 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  // `.font(.title2.bold())`
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  link: { minHeight: 44, justifyContent: 'center' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // `.padding(20)`, corner radius 22.
  bestCard: { gap: 12, padding: 20, borderRadius: 22 },
  bestLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  choice: { gap: 6 },
  choiceTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  alternative: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  grow: { flex: 1 },
  prominent: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 16, alignSelf: 'flex-start' },
  prominentLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  dimmed: { opacity: 0.45 },
});

export { Alert };
